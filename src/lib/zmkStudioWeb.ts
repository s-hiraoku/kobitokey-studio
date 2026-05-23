import { call_rpc, Request, Response, RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import { get_decoder, get_encoder } from "@zmkfirmware/zmk-studio-ts-client/framing";
import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { connect as connectWebSerial } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { BehaviorBinding, Keymap, SetLayerBindingResponse } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { StudioComboSet } from "./directKeymap";

export type StudioConnectionKind = "usb" | "bluetooth";

export type WebStudioKeymap = {
  deviceName: string;
  serialNumber: string;
  lockState: string;
  hasUnsavedChanges: boolean;
  layers: Array<{
    id: number;
    name: string;
    bindings: string[];
  }>;
};

export type WebStudioSession = {
  kind: StudioConnectionKind;
  label: string;
  keymap: WebStudioKeymap;
};

export type DirectTrackballSettings = {
  cpi: number;
  cursorNumerator: number;
  cursorDenominator: number;
  scrollNumerator: number;
  scrollDenominator: number;
};

type WebStudioNavigator = Navigator & {
  serial?: unknown;
  bluetooth?: {
    requestDevice?: (options: Record<string, unknown>) => Promise<WebBluetoothDevice>;
  };
};

type WebBluetoothDevice = EventTarget & {
  gatt?: {
    connected: boolean;
    connect: () => Promise<void>;
    disconnect: () => void;
    getPrimaryService: (service: string) => Promise<WebBluetoothService>;
  };
  name?: string;
};

type WebBluetoothService = {
  getCharacteristic: (characteristic: string) => Promise<WebBluetoothCharacteristic>;
};

type WebBluetoothCharacteristic = EventTarget & {
  value?: DataView;
  getCharacteristic?: never;
  startNotifications: () => Promise<WebBluetoothCharacteristic>;
  stopNotifications: () => Promise<WebBluetoothCharacteristic>;
  writeValueWithoutResponse: (value: BufferSource) => Promise<void>;
};

let activeConnection: RpcConnection | null = null;
let activeTransportAbort: AbortController | null = null;
let activeBehaviorCatalog: Map<number, string> = new Map();
let behaviorIdByRole: Map<string, number> = new Map();
let rawStudioRequestIds = new Set<number>();
let rawSubsystemRpcQueue: Promise<void> = Promise.resolve();
let rawFramePumpGeneration = 0;
let rawFrameQueue: Uint8Array[] = [];
let rawFrameWaiters: Array<(frame: Uint8Array | null) => void> = [];

const RAW_SUBSYSTEM_RPC_TIMEOUT_MS = 6_000;
const RAW_SUBSYSTEM_STALE_DRAIN_TIMEOUT_MS = 250;
const RAW_SUBSYSTEM_STALE_DRAIN_MAX_FRAMES = 256;

export type WebStudioComboInput = {
  binding: string;
  keyPositions: number[];
  timeoutMs: number;
  requirePriorIdleMs?: number;
  layerMask?: number;
  slowRelease?: boolean;
};

export function supportsWebStudioConnection(kind: StudioConnectionKind): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const webNavigator = navigator as WebStudioNavigator;
  switch (kind) {
    case "usb":
      return "serial" in webNavigator;
    case "bluetooth":
      return typeof webNavigator.bluetooth?.requestDevice === "function";
  }
}

export function supportsWebSerial(): boolean {
  return supportsWebStudioConnection("usb");
}

export function supportsWebBluetooth(): boolean {
  return supportsWebStudioConnection("bluetooth");
}

export async function connectWebStudioDevice(kind: StudioConnectionKind = "usb"): Promise<WebStudioSession> {
  if (!supportsWebStudioConnection(kind)) {
    throw new Error(
      kind === "usb"
        ? "Web Serial is not available. Use Chrome or Edge from localhost/HTTPS, and make sure the page has device permissions."
        : "Web Bluetooth is not available. Use Chrome or Edge from localhost/HTTPS, and make sure Bluetooth is enabled.",
    );
  }
  // Tear down any prior session before starting a new one so we never leak
  // a transport on reconnect.
  disconnectWebStudioDevice();
  const transport = kind === "usb" ? await connectWebSerial() : await connectWebGattWithFallback();
  const { connection, rawResponseReadable } = createWebRpcConnection(transport, { signal: transport.abortController.signal });
  startRawResponsePump(rawResponseReadable, transport.abortController.signal);
  try {
    await call_rpc(connection, { core: { getDeviceInfo: true } });
    const catalog = await loadBehaviorCatalog(connection).catch((error) => {
      throw new Error(
        `Connected, but the device did not allow reading behaviors. Press the Studio Unlock key on the keyboard, then reconnect. (${formatWebError(error)})`,
      );
    });
    activeConnection = connection;
    activeTransportAbort = transport.abortController;
    activeBehaviorCatalog = catalog;
    behaviorIdByRole = invertBehaviorCatalog(catalog);
    return {
      kind,
      label: connection.label,
      keymap: await readWebStudioKeymap(),
    };
  } catch (error) {
    resetWebStudioState();
    transport.abortController.abort();
    throw error;
  }
}

export async function readWebStudioKeymap(): Promise<WebStudioKeymap> {
  const conn = requireConnection();
  const deviceInfo = await call_rpc(conn, { core: { getDeviceInfo: true } });
  const lockResponse = await call_rpc(conn, { core: { getLockState: true } });
  const keymapResponse = await call_rpc(conn, { keymap: { getKeymap: true } });
  const unsavedResponse = await call_rpc(conn, { keymap: { checkUnsavedChanges: true } });
  const keymap = keymapResponse.keymap?.getKeymap;
  if (!keymap) {
    throw new Error("Device did not return a keymap");
  }

  return formatWebStudioKeymap({
    deviceName: deviceInfo.core?.getDeviceInfo?.name ?? "ZMK Studio device",
    serialNumber: decodeSerial(deviceInfo.core?.getDeviceInfo?.serialNumber),
    lockState: formatLockState(lockResponse.core?.getLockState),
    hasUnsavedChanges: Boolean(unsavedResponse.keymap?.checkUnsavedChanges),
    keymap,
  });
}

async function connectWebGattWithFallback() {
  const serviceUuid = "00000000-0196-6107-c967-c5cfb1c2482a";
  const rpcCharacteristicUuid = "00000001-0196-6107-c967-c5cfb1c2482a";
  const bluetooth = (navigator as WebStudioNavigator).bluetooth;
  if (typeof bluetooth?.requestDevice !== "function") {
    throw new Error("Web Bluetooth API is not supported in this browser. Please use Chrome or Edge.");
  }

  const device = await bluetooth.requestDevice({
    filters: [{ services: [serviceUuid] }],
    optionalServices: [serviceUuid],
  }).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      throw new Error("ZMK Studio 用の Bluetooth デバイスが選択されませんでした。キーボードを接続待ち状態にして、通常のキーボード接続ではなく ZMK Studio 用として表示されるデバイスを選んでください。");
    }
    throw error;
  });

  if (!device.gatt) {
    throw new Error("Selected Bluetooth device does not expose GATT.");
  }

  if (!device.gatt.connected) {
    await device.gatt.connect();
  }
  const service = await device.gatt.getPrimaryService(serviceUuid).catch((error: unknown) => {
    throw new Error(
      `選択した Bluetooth デバイスは ZMK Studio 用の接続に対応していません。通常のキーボード接続ではなく、ZMK Studio 用として表示されるデバイスを選んでください。(${formatWebError(error)})`,
    );
  });
  const characteristic = await service.getCharacteristic(rpcCharacteristicUuid).catch((error: unknown) => {
    throw new Error(`Selected Bluetooth device exposes ZMK Studio service but not the RPC characteristic. (${formatWebError(error)})`);
  });
  const abortController = new AbortController();
  let cleanupNotifications: (() => void) | undefined;

  const cleanup = () => {
    cleanupNotifications?.();
    cleanupNotifications = undefined;
  };

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await characteristic.stopNotifications();
      } catch {
        // Some browsers reject if notifications were not active.
      }
      await characteristic.startNotifications();
      const onValueChanged = (event: Event) => {
        const value = (event.target as WebBluetoothCharacteristic | null)?.value;
        if (value) {
          controller.enqueue(new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)));
        }
      };
      const onDisconnected = () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // The stream may already be closed by local cancellation.
        }
        if (!abortController.signal.aborted) {
          abortController.abort();
        }
      };
      cleanupNotifications = () => {
        characteristic.removeEventListener("characteristicvaluechanged", onValueChanged);
        device.removeEventListener("gattserverdisconnected", onDisconnected);
      };
      characteristic.addEventListener("characteristicvaluechanged", onValueChanged);
      device.addEventListener("gattserverdisconnected", onDisconnected);
    },
    cancel() {
      cleanup();
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
    },
  });
  const writable = new WritableStream<Uint8Array>({
    async write(chunk) {
      const maxChunk = 20;
      const bytes = new Uint8Array(chunk);
      for (let offset = 0; offset < bytes.byteLength; offset += maxChunk) {
        await characteristic.writeValueWithoutResponse(bytes.subarray(offset, offset + maxChunk));
      }
    },
    close() {
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
    },
    abort() {
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
    },
  });

  abortController.signal.addEventListener(
    "abort",
    () => {
      cleanup();
      device.gatt?.disconnect();
    },
    { once: true },
  );
  return { label: device.name || "Bluetooth ZMK device", abortController, readable, writable };
}

function formatWebError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function writeWebStudioKey(layerId: number, keyPosition: number, binding: string): Promise<WebStudioKeymap> {
  const conn = requireConnection();
  const behaviorBinding = parseWebBinding(binding);
  const setResponse = await call_rpc(conn, {
    keymap: {
      setLayerBinding: {
        layerId,
        keyPosition,
        binding: behaviorBinding,
      },
    },
  });
  const setResult = setResponse.keymap?.setLayerBinding;
  if (setResult !== SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK) {
    throw new Error(`Set layer binding failed: ${String(setResult)}`);
  }

  const saveResponse = await call_rpc(conn, { keymap: { saveChanges: true } });
  if (saveResponse.keymap?.saveChanges?.err) {
    throw new Error(`Save changes failed: ${String(saveResponse.keymap.saveChanges.err)}`);
  }

  return readWebStudioKeymap();
}

export async function readWebStudioCombos(): Promise<StudioComboSet> {
  const response = await callWebSubsystemRpc(7, encodeGetCombosRequest());
  return decodeGetCombosResponse(response);
}

export async function addWebStudioCombo(combo: WebStudioComboInput): Promise<StudioComboSet> {
  const config = encodeComboConfig(combo);
  const response = await callWebSubsystemRpc(7, encodeAddComboRequest(config));
  decodeAddComboResponse(response);
  await saveWebStudioChanges();
  return readWebStudioCombos();
}

export async function setWebStudioCombo(index: number, combo: WebStudioComboInput): Promise<StudioComboSet> {
  const config = encodeComboConfig(combo);
  const response = await callWebSubsystemRpc(7, encodeSetComboRequest(index, config));
  decodeSetComboResponse(response);
  await saveWebStudioChanges();
  return readWebStudioCombos();
}

export async function removeWebStudioCombo(index: number): Promise<StudioComboSet> {
  const response = await callWebSubsystemRpc(7, encodeRemoveComboRequest(index));
  decodeRemoveComboResponse(response);
  await saveWebStudioChanges();
  return readWebStudioCombos();
}

export async function readWebTrackballSettings(): Promise<DirectTrackballSettings> {
  const response = await callWebSubsystemRpc(6, encodeGetSensitivityRequest());
  return decodeGetSensitivityResponse(response);
}

export async function writeWebTrackballSettings(settings: DirectTrackballSettings): Promise<DirectTrackballSettings> {
  const response = await callWebSubsystemRpc(6, encodeSetSensitivityRequest(settings));
  decodeSetSensitivityResponse(response);
  return readWebTrackballSettings();
}

function resetWebStudioState() {
  activeConnection = null;
  activeTransportAbort = null;
  activeBehaviorCatalog = new Map();
  behaviorIdByRole = new Map();
  rawStudioRequestIds = new Set();
  rawSubsystemRpcQueue = Promise.resolve();
  rawFramePumpGeneration += 1;
  rawFrameQueue = [];
  const waiters = rawFrameWaiters;
  rawFrameWaiters = [];
  waiters.forEach((resolve) => resolve(null));
}

export function disconnectWebStudioDevice(): void {
  if (activeTransportAbort && !activeTransportAbort.signal.aborted) {
    activeTransportAbort.abort();
  }
  resetWebStudioState();
}

function requireConnection(): RpcConnection {
  if (!activeConnection) {
    throw new Error("No Web Studio device is connected");
  }
  return activeConnection;
}

function createWebRpcConnection(transport: RpcTransport, opts?: { signal?: AbortSignal }) {
  const { writable: requestWritable, readable: byteReadable } = new TransformStream<Request | Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk instanceof Uint8Array ? chunk : Request.encode(chunk).finish());
    },
  });
  const reqPipelineClosed = byteReadable
    .pipeThrough(new TransformStream(get_encoder()), { signal: opts?.signal })
    .pipeTo(transport.writable, { signal: opts?.signal });
  reqPipelineClosed
    .catch((reason) => reason)
    .then(async (reason) => {
      await byteReadable.cancel();
      transport.abortController.abort(reason);
    });

  const framedReadable = transport.readable.pipeThrough(new TransformStream(get_decoder()), { signal: opts?.signal });
  const [rawResponseReadable, decodedFrameReadable] = framedReadable.tee();
  const responseReadable = decodedFrameReadable.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(Response.decode(chunk));
      },
    }),
    { signal: opts?.signal },
  );
  const [requestResponses, notifications] = responseReadable.tee();
  const requestResponseReadable = requestResponses.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        const response = chunk.requestResponse;
        if (response && !rawStudioRequestIds.has(response.requestId)) {
          controller.enqueue(response);
        }
      },
    }),
    { signal: opts?.signal },
  );
  const notificationReadable = notifications.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        if (chunk.notification) {
          controller.enqueue(chunk.notification);
        }
      },
    }),
    { signal: opts?.signal },
  );

  return {
    connection: {
      label: transport.label,
      request_response_readable: requestResponseReadable,
      request_writable: requestWritable as WritableStream<Request>,
      notification_readable: notificationReadable,
      current_request: 0,
    },
    rawResponseReadable,
  };
}

function startRawResponsePump(rawResponseReadable: ReadableStream<Uint8Array>, signal?: AbortSignal): void {
  const generation = rawFramePumpGeneration;
  const reader = rawResponseReadable.getReader();
  const cancelReader = () => {
    reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", cancelReader, { once: true });

  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done || generation !== rawFramePumpGeneration) {
          break;
        }
        if (value) {
          enqueueRawResponseFrame(value, generation);
        }
      }
    } finally {
      signal?.removeEventListener("abort", cancelReader);
      try {
        reader.releaseLock();
      } catch {
        // The reader can already be released after transport abort.
      }
      closeRawResponseQueue(generation);
    }
  })();
}

function enqueueRawResponseFrame(frame: Uint8Array, generation: number): void {
  if (generation !== rawFramePumpGeneration) {
    return;
  }
  const waiter = rawFrameWaiters.shift();
  if (waiter) {
    waiter(frame);
    return;
  }
  rawFrameQueue.push(frame);
}

function closeRawResponseQueue(generation: number): void {
  if (generation !== rawFramePumpGeneration) {
    return;
  }
  const waiters = rawFrameWaiters;
  rawFrameWaiters = [];
  waiters.forEach((resolve) => resolve(null));
}

async function callWebSubsystemRpc(subsystemField: number, subsystemRequest: Uint8Array): Promise<Uint8Array> {
  let releaseQueue: () => void = () => {};
  const previous = rawSubsystemRpcQueue;
  rawSubsystemRpcQueue = new Promise((resolve) => {
    releaseQueue = resolve;
  });
  await previous;
  try {
    return await callWebSubsystemRpcUnlocked(subsystemField, subsystemRequest);
  } finally {
    releaseQueue();
  }
}

async function callWebSubsystemRpcUnlocked(subsystemField: number, subsystemRequest: Uint8Array): Promise<Uint8Array> {
  const conn = requireConnection();
  await drainStaleRawResponseFrames();
  const requestId = 1;
  rawStudioRequestIds.add(requestId);
  const observation: RawSubsystemObservation = {
    notificationFrames: 0,
    otherRequestResponses: 0,
    otherRequestIds: [],
    samples: [],
    unknownFrames: 0,
  };

  const request = new Uint8ArrayWriter();
  request.varintField(1, requestId);
  request.lenField(subsystemField, subsystemRequest);

  const writer = (conn.request_writable as WritableStream<Request | Uint8Array>).getWriter();
  await writer.write(request.finish());
  writer.releaseLock();

  for (;;) {
    let frame: ReadableStreamReadResult<Uint8Array>;
    try {
      frame = await readRawResponseFrame();
    } catch (error) {
      if (isRawSubsystemTimeout(error)) {
        throw new Error(formatRawSubsystemTimeout(subsystemField, observation));
      }
      throw error;
    }
    const { done, value } = frame;
    if (done || !value) {
      throw new Error("No RPC response received");
    }
    recordRawSubsystemObservation(value, requestId, observation);
    const response = decodeSubsystemResponseFrame(value, requestId, subsystemField);
    if (response) {
      return response;
    }
  }
}

async function readRawResponseFrame(): Promise<ReadableStreamReadResult<Uint8Array>> {
  return readRawResponseFrameWithTimeout(RAW_SUBSYSTEM_RPC_TIMEOUT_MS);
}

async function readRawResponseFrameWithTimeout(
  timeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const queued = rawFrameQueue.shift();
  if (queued) {
    return { done: false, value: queued };
  }

  let timeoutId: number | undefined;
  return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
    const waiter = (frame: Uint8Array | null) => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      if (frame) {
        resolve({ done: false, value: frame });
        return;
      }
      resolve({ done: true, value: undefined });
    };
    rawFrameWaiters.push(waiter);
    timeoutId = window.setTimeout(() => {
      rawFrameWaiters = rawFrameWaiters.filter((candidate) => candidate !== waiter);
      reject(new RawSubsystemTimeoutError());
    }, timeoutMs);
  });
}

async function drainStaleRawResponseFrames(): Promise<void> {
  for (let index = 0; index < RAW_SUBSYSTEM_STALE_DRAIN_MAX_FRAMES; index += 1) {
    try {
      const { done } = await readRawResponseFrameWithTimeout(RAW_SUBSYSTEM_STALE_DRAIN_TIMEOUT_MS);
      if (done) {
        return;
      }
    } catch (error) {
      if (isRawSubsystemTimeout(error)) {
        return;
      }
      throw error;
    }
  }
}

class RawSubsystemTimeoutError extends Error {
  constructor() {
    super("Timed out waiting for Studio subsystem response");
    this.name = "RawSubsystemTimeoutError";
  }
}

function isRawSubsystemTimeout(error: unknown): error is RawSubsystemTimeoutError {
  return error instanceof RawSubsystemTimeoutError;
}

type RawSubsystemObservation = {
  notificationFrames: number;
  otherRequestResponses: number;
  otherRequestIds: number[];
  samples: string[];
  unknownFrames: number;
};

function recordRawSubsystemObservation(
  frame: Uint8Array,
  requestId: number,
  observation: RawSubsystemObservation,
): void {
  if (observation.samples.length < 3) {
    observation.samples.push(describeRawFrame(frame));
  }
  const requestResponse = findLenField(frame, 1);
  if (requestResponse) {
    const responseRequestId = findVarintField(requestResponse, 1);
    if (responseRequestId !== requestId) {
      observation.otherRequestResponses += 1;
      if (responseRequestId !== undefined && !observation.otherRequestIds.includes(responseRequestId)) {
        observation.otherRequestIds.push(responseRequestId);
      }
    }
    return;
  }
  if (findLenField(frame, 2)) {
    observation.notificationFrames += 1;
    return;
  }
  observation.unknownFrames += 1;
}

function describeRawFrame(frame: Uint8Array): string {
  const topFields = describeFields(frame);
  const requestResponse = findLenField(frame, 1);
  if (!requestResponse) {
    return `top=[${topFields}]`;
  }
  return `top=[${topFields}] responseId=${formatMaybeNumber(findVarintField(requestResponse, 1))} responseFields=[${describeFields(requestResponse)}]`;
}

function describeFields(bytes: Uint8Array): string {
  const fields: string[] = [];
  let cursor = 0;
  while (cursor < bytes.length && fields.length < 8) {
    const tagResult = readVarint(bytes, cursor);
    if (!tagResult) {
      fields.push("invalid");
      break;
    }
    cursor = tagResult.next;
    const field = tagResult.value >> 3;
    const wire = tagResult.value & 0x07;
    if (wire === 0) {
      const valueResult = readVarint(bytes, cursor);
      if (!valueResult) {
        fields.push(`${field}:varint(invalid)`);
        break;
      }
      fields.push(`${field}:varint(${valueResult.value})`);
      cursor = valueResult.next;
    } else if (wire === 2) {
      const lengthResult = readVarint(bytes, cursor);
      if (!lengthResult) {
        fields.push(`${field}:len(invalid)`);
        break;
      }
      fields.push(`${field}:len(${lengthResult.value})`);
      cursor = lengthResult.next + lengthResult.value;
      if (cursor > bytes.length) {
        fields.push("truncated");
        break;
      }
    } else {
      fields.push(`${field}:wire(${wire})`);
      break;
    }
  }
  return fields.join(", ");
}

function formatMaybeNumber(value: number | undefined): string {
  return value === undefined ? "unknown" : String(value);
}

function formatRawSubsystemTimeout(subsystemField: number, observation: RawSubsystemObservation): string {
  const label = formatSubsystemLabel(subsystemField);
  const details = [
    observation.notificationFrames > 0 ? `通知 ${observation.notificationFrames} 件` : "",
    observation.otherRequestResponses > 0
      ? `別 requestId の応答 ${observation.otherRequestResponses} 件${formatObservedRequestIds(observation.otherRequestIds)}`
      : "",
    observation.unknownFrames > 0 ? `不明フレーム ${observation.unknownFrames} 件` : "",
  ].filter(Boolean);
  const frameNote =
    details.length > 0
      ? ` ${details.join(" / ")}は受信しましたが、該当する応答はありませんでした。`
      : " 実機から該当する応答フレームを受信できませんでした。";
  const samples = observation.samples.length > 0 ? ` 受信サンプル: ${observation.samples.join(" | ")}` : "";
  return `実機 firmware が ${label} に応答しませんでした。${frameNote}対応する Studio RPC 実装を含む firmware に更新してください。${samples}`;
}

function formatObservedRequestIds(requestIds: number[]): string {
  if (requestIds.length === 0) {
    return " (id 省略 = 0)";
  }
  return ` (${requestIds.slice(0, 4).join(", ")})`;
}

function formatSubsystemLabel(subsystemField: number): string {
  switch (subsystemField) {
    case 6:
      return "Direct Trackball RPC (Studio subsystem 6)";
    case 7:
      return "Direct Combo RPC (Studio subsystem 7)";
    default:
      return `Studio subsystem ${subsystemField}`;
  }
}

async function saveWebStudioChanges(): Promise<void> {
  const response = await call_rpc(requireConnection(), { keymap: { saveChanges: true } });
  if (response.keymap?.saveChanges?.err) {
    throw new Error(`Save changes failed: ${String(response.keymap.saveChanges.err)}`);
  }
}

function encodeGetCombosRequest(): Uint8Array {
  const request = new Uint8ArrayWriter();
  request.lenField(1, new Uint8Array());
  return request.finish();
}

function encodeSetComboRequest(index: number, comboConfig: Uint8Array): Uint8Array {
  const setRequest = new Uint8ArrayWriter();
  setRequest.varintField(1, index);
  setRequest.lenField(2, comboConfig);

  const request = new Uint8ArrayWriter();
  request.lenField(2, setRequest.finish());
  return request.finish();
}

function encodeAddComboRequest(comboConfig: Uint8Array): Uint8Array {
  const addRequest = new Uint8ArrayWriter();
  addRequest.lenField(1, comboConfig);

  const request = new Uint8ArrayWriter();
  request.lenField(3, addRequest.finish());
  return request.finish();
}

function encodeRemoveComboRequest(index: number): Uint8Array {
  const removeRequest = new Uint8ArrayWriter();
  removeRequest.varintField(1, index);

  const request = new Uint8ArrayWriter();
  request.lenField(4, removeRequest.finish());
  return request.finish();
}

function encodeComboConfig(combo: WebStudioComboInput): Uint8Array {
  const rawBinding = encodeWebBehaviorBinding(parseWebBinding(combo.binding));
  const config = new Uint8ArrayWriter();
  combo.keyPositions.forEach((position) => config.varintField(1, position));
  config.lenField(2, rawBinding);
  config.varintField(3, combo.timeoutMs);
  config.varintField(4, combo.requirePriorIdleMs ?? 0);
  config.varintField(5, combo.layerMask ?? 0xffffffff);
  config.varintField(6, combo.slowRelease ? 1 : 0);
  return config.finish();
}

function encodeWebBehaviorBinding(binding: BehaviorBinding): Uint8Array {
  const writer = new Uint8ArrayWriter();
  writer.varintField(1, binding.behaviorId);
  writer.varintField(2, binding.param1);
  writer.varintField(3, binding.param2);
  return writer.finish();
}

function encodeGetSensitivityRequest(): Uint8Array {
  const request = new Uint8ArrayWriter();
  request.lenField(2, new Uint8Array());
  return request.finish();
}

function encodeSetSensitivityRequest(settings: DirectTrackballSettings): Uint8Array {
  const setRequest = new Uint8ArrayWriter();
  setRequest.lenField(1, encodeSensitivityScale(settings.cursorNumerator, settings.cursorDenominator));
  setRequest.lenField(2, encodeSensitivityScale(settings.scrollNumerator, settings.scrollDenominator));
  setRequest.varintField(3, settings.cpi);

  const request = new Uint8ArrayWriter();
  request.lenField(1, setRequest.finish());
  return request.finish();
}

function encodeSensitivityScale(numerator: number, denominator: number): Uint8Array {
  const scale = new Uint8ArrayWriter();
  scale.varintField(1, numerator);
  scale.varintField(2, Math.max(1, denominator));
  return scale.finish();
}

function decodeGetCombosResponse(comboResponse: Uint8Array): StudioComboSet {
  const combosResponse = findLenField(comboResponse, 1);
  if (!combosResponse) {
    throw new Error("Device did not return combos");
  }
  const combos = findLenFields(combosResponse, 1).map((bytes, index) => decodeComboConfig(index, bytes));
  const maxCombos = findVarintField(combosResponse, 2) ?? combos.length;
  return { combos, maxCombos };
}

function decodeComboConfig(index: number, bytes: Uint8Array): StudioComboSet["combos"][number] {
  const keyPositions = findVarintFields(bytes, 1);
  const binding = findLenField(bytes, 2);
  return {
    id: `direct_combo_${index + 1}`,
    index,
    binding: binding ? formatWebBehaviorBinding(decodeWebBehaviorBinding(binding)) : "&none",
    keyPositions,
    timeoutMs: findVarintField(bytes, 3) ?? 50,
    requirePriorIdleMs: findVarintField(bytes, 4) ?? 0,
    layerMask: findVarintField(bytes, 5) ?? 0xffffffff,
    slowRelease: (findVarintField(bytes, 6) ?? 0) !== 0,
  };
}

function decodeWebBehaviorBinding(bytes: Uint8Array): BehaviorBinding {
  return {
    behaviorId: findVarintField(bytes, 1) ?? 0,
    param1: findVarintField(bytes, 2) ?? 0,
    param2: findVarintField(bytes, 3) ?? 0,
  };
}

function decodeGetSensitivityResponse(pointingResponse: Uint8Array): DirectTrackballSettings {
  const getResponse = findLenField(pointingResponse, 2);
  if (!getResponse) {
    throw new Error("実機が Trackball 感度設定を返しませんでした。");
  }
  const cursor = decodeSensitivityScale(findLenField(getResponse, 1));
  const scroll = decodeSensitivityScale(findLenField(getResponse, 2));
  return {
    cpi: findVarintField(getResponse, 3) ?? 800,
    cursorNumerator: cursor.numerator,
    cursorDenominator: cursor.denominator,
    scrollNumerator: scroll.numerator,
    scrollDenominator: scroll.denominator,
  };
}

function decodeSetSensitivityResponse(pointingResponse: Uint8Array): void {
  const setResponse = findLenField(pointingResponse, 1);
  if (!setResponse) {
    throw new Error("実機が Trackball 感度保存の結果を返しませんでした。");
  }
  if ((findVarintField(setResponse, 1) ?? 0) !== 0) {
    return;
  }
  const code = findVarintField(setResponse, 2) ?? 0;
  if (code === 0) {
    return;
  }
  if (code === 1) {
    throw new Error("実機 firmware が Trackball 感度 RPC に対応していません。");
  }
  if (code === 2) {
    throw new Error("Trackball 感度の値が無効です。");
  }
  if (code === 3) {
    throw new Error("Trackball 感度を実機の保存領域へ書き込めませんでした。");
  }
  throw new Error(`Trackball 感度保存に失敗しました: code ${code}`);
}

function decodeSensitivityScale(bytes: Uint8Array | undefined): { numerator: number; denominator: number } {
  return {
    numerator: bytes ? findVarintField(bytes, 1) ?? 1 : 1,
    denominator: Math.max(1, bytes ? findVarintField(bytes, 2) ?? 1 : 1),
  };
}

function decodeSetComboResponse(comboResponse: Uint8Array): void {
  const setResponse = findLenField(comboResponse, 2);
  if (!setResponse) {
    throw new Error("Device did not return setCombo result");
  }
  const code = findVarintField(setResponse, 2) ?? 0;
  if (code === 0) {
    return;
  }
  if (code === 2) {
    throw new Error("Combo index is invalid");
  }
  if (code === 3) {
    throw new Error("Combo parameters are invalid");
  }
  throw new Error(`Set combo failed with error code ${code}`);
}

function decodeAddComboResponse(comboResponse: Uint8Array): void {
  const addResponse = findLenField(comboResponse, 3);
  if (!addResponse) {
    throw new Error("Device did not return addCombo result");
  }
  if (findLenField(addResponse, 1)) {
    return;
  }
  const code = findVarintField(addResponse, 2) ?? 0;
  if (code === 0) {
    return;
  }
  if (code === 2) {
    throw new Error("No combo slots are available on the device");
  }
  if (code === 3) {
    throw new Error("Combo parameters are invalid");
  }
  throw new Error(`Add combo failed with error code ${code}`);
}

function decodeRemoveComboResponse(comboResponse: Uint8Array): void {
  const removeResponse = findLenField(comboResponse, 4);
  if (!removeResponse) {
    throw new Error("Device did not return removeCombo result");
  }
  const code = findVarintField(removeResponse, 2) ?? 0;
  if (code === 0) {
    return;
  }
  if (code === 2) {
    throw new Error("Combo index is invalid");
  }
  throw new Error(`Remove combo failed with error code ${code}`);
}

function decodeSubsystemResponseFrame(frame: Uint8Array, requestId: number, subsystemField: number): Uint8Array | null {
  const requestResponse = findLenField(frame, 1);
  if (!requestResponse) {
    return null;
  }
  const subsystemResponse = findLenField(requestResponse, subsystemField);
  if (subsystemResponse) {
    return subsystemResponse;
  }
  const responseRequestId = findVarintField(requestResponse, 1);
  const meta = findLenField(requestResponse, 2);
  if (meta && responseRequestId === undefined) {
    throw new Error(decodeMetaError(meta, subsystemField));
  }
  if (responseRequestId !== requestId) {
    return null;
  }
  if (meta) {
    throw new Error(decodeMetaError(meta, subsystemField));
  }
  return null;
}

function decodeMetaError(meta: Uint8Array, subsystemField: number): string {
  const label = formatSubsystemLabel(subsystemField);
  if ((findVarintField(meta, 1) ?? 0) !== 0) {
    return `実機 firmware が ${label} に応答しませんでした。対応する Studio RPC 実装を含む firmware に更新してください。`;
  }
  switch (findVarintField(meta, 2) ?? 0) {
    case 1:
      return "実機がロックされています。キーボード側で ZMK Studio を Unlock してください。";
    case 2:
      return `実機 firmware に ${label} がありません。対応する Studio RPC 実装を含む firmware に更新してください。`;
    case 3:
      return `実機が ${label} のリクエストを解釈できませんでした。`;
    case 4:
      return `実機が ${label} のレスポンスを生成できませんでした。`;
    default:
      return `実機が Studio RPC エラー code ${findVarintField(meta, 2) ?? 0} を返しました。`;
  }
}

class Uint8ArrayWriter {
  private bytes: number[] = [];

  varintField(fieldNumber: number, value: number): void {
    this.varint(fieldNumber << 3);
    this.varint(value);
  }

  lenField(fieldNumber: number, bytes: Uint8Array): void {
    this.varint((fieldNumber << 3) | 2);
    this.varint(bytes.length);
    this.bytes.push(...bytes);
  }

  finish(): Uint8Array {
    return new Uint8Array(this.bytes);
  }

  private varint(value: number): void {
    let next = Math.trunc(value);
    if (!Number.isFinite(next) || next < 0) {
      throw new Error(`Invalid varint value: ${value}`);
    }
    while (next >= 0x80) {
      this.bytes.push((next % 0x80) | 0x80);
      next = Math.floor(next / 0x80);
    }
    this.bytes.push(next);
  }
}

function findVarintField(bytes: Uint8Array, fieldNumber: number): number | undefined {
  let cursor = 0;
  while (cursor < bytes.length) {
    const tagResult = readVarint(bytes, cursor);
    if (!tagResult) {
      return undefined;
    }
    cursor = tagResult.next;
    const field = tagResult.value >> 3;
    const wire = tagResult.value & 0x07;
    if (wire === 0) {
      const valueResult = readVarint(bytes, cursor);
      if (!valueResult) {
        return undefined;
      }
      cursor = valueResult.next;
      if (field === fieldNumber) {
        return valueResult.value;
      }
    } else if (wire === 2) {
      const lengthResult = readVarint(bytes, cursor);
      if (!lengthResult) {
        return undefined;
      }
      cursor = lengthResult.next + lengthResult.value;
    } else {
      return undefined;
    }
  }
  return undefined;
}

function findVarintFields(bytes: Uint8Array, fieldNumber: number): number[] {
  const values: number[] = [];
  let cursor = 0;
  while (cursor < bytes.length) {
    const tagResult = readVarint(bytes, cursor);
    if (!tagResult) {
      break;
    }
    cursor = tagResult.next;
    const field = tagResult.value >> 3;
    const wire = tagResult.value & 0x07;
    if (wire === 0) {
      const valueResult = readVarint(bytes, cursor);
      if (!valueResult) {
        break;
      }
      cursor = valueResult.next;
      if (field === fieldNumber) {
        values.push(valueResult.value);
      }
    } else if (wire === 2) {
      const lengthResult = readVarint(bytes, cursor);
      if (!lengthResult) {
        break;
      }
      cursor = lengthResult.next + lengthResult.value;
    } else {
      break;
    }
  }
  return values;
}

function findLenField(bytes: Uint8Array, fieldNumber: number): Uint8Array | undefined {
  let cursor = 0;
  while (cursor < bytes.length) {
    const tagResult = readVarint(bytes, cursor);
    if (!tagResult) {
      return undefined;
    }
    cursor = tagResult.next;
    const field = tagResult.value >> 3;
    const wire = tagResult.value & 0x07;
    if (wire === 0) {
      const valueResult = readVarint(bytes, cursor);
      if (!valueResult) {
        return undefined;
      }
      cursor = valueResult.next;
    } else if (wire === 2) {
      const lengthResult = readVarint(bytes, cursor);
      if (!lengthResult) {
        return undefined;
      }
      const start = lengthResult.next;
      const end = start + lengthResult.value;
      if (end > bytes.length) {
        return undefined;
      }
      if (field === fieldNumber) {
        return bytes.slice(start, end);
      }
      cursor = end;
    } else {
      return undefined;
    }
  }
  return undefined;
}

function findLenFields(bytes: Uint8Array, fieldNumber: number): Uint8Array[] {
  const values: Uint8Array[] = [];
  let cursor = 0;
  while (cursor < bytes.length) {
    const tagResult = readVarint(bytes, cursor);
    if (!tagResult) {
      break;
    }
    cursor = tagResult.next;
    const field = tagResult.value >> 3;
    const wire = tagResult.value & 0x07;
    if (wire === 0) {
      const valueResult = readVarint(bytes, cursor);
      if (!valueResult) {
        break;
      }
      cursor = valueResult.next;
    } else if (wire === 2) {
      const lengthResult = readVarint(bytes, cursor);
      if (!lengthResult) {
        break;
      }
      const start = lengthResult.next;
      const end = start + lengthResult.value;
      if (end > bytes.length) {
        break;
      }
      if (field === fieldNumber) {
        values.push(bytes.slice(start, end));
      }
      cursor = end;
    } else {
      break;
    }
  }
  return values;
}

function readVarint(bytes: Uint8Array, cursor: number): { value: number; next: number } | undefined {
  let value = 0;
  let multiplier = 1;
  let next = cursor;
  while (next < bytes.length && multiplier <= 2 ** 63) {
    const byte = bytes[next];
    next += 1;
    value += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) {
      return { value, next };
    }
    multiplier *= 0x80;
  }
  return undefined;
}

async function loadBehaviorCatalog(conn: RpcConnection): Promise<Map<number, string>> {
  const response = await call_rpc(conn, { behaviors: { listAllBehaviors: true } });
  const behaviorIds = response.behaviors?.listAllBehaviors?.behaviors ?? [];
  const entries = await Promise.all(
    behaviorIds.map(async (behaviorId) => {
      const details = await call_rpc(conn, { behaviors: { getBehaviorDetails: { behaviorId } } });
      return [behaviorId, details.behaviors?.getBehaviorDetails?.displayName ?? ""] as const;
    }),
  );
  return new Map(entries.filter(([, displayName]) => displayName.length > 0));
}

function invertBehaviorCatalog(catalog: Map<number, string>): Map<string, number> {
  const map = new Map<string, number>();
  catalog.forEach((displayName, behaviorId) => {
    const role = roleFromDisplayName(displayName);
    if (role && !map.has(role)) {
      map.set(role, behaviorId);
    }
  });
  return map;
}

function formatWebStudioKeymap({
  deviceName,
  hasUnsavedChanges,
  keymap,
  lockState,
  serialNumber,
}: {
  deviceName: string;
  hasUnsavedChanges: boolean;
  keymap: Keymap;
  lockState: string;
  serialNumber: string;
}): WebStudioKeymap {
  return {
    deviceName,
    serialNumber,
    lockState,
    hasUnsavedChanges,
    layers: keymap.layers.map((layer, index) => ({
      id: layer.id,
      name: layer.name || `Layer ${index}`,
      bindings: layer.bindings.map(formatWebBehaviorBinding),
    })),
  };
}

function formatWebBehaviorBinding(binding: BehaviorBinding): string {
  const role = activeBehaviorCatalog.get(binding.behaviorId);
  switch (roleFromDisplayName(role ?? "")) {
    case "key":
      return `&kp ${formatHidUsage(binding.param1)}`;
    case "key-toggle":
      return `&kt ${formatHidUsage(binding.param1)}`;
    case "layer-tap":
      return `&lt ${binding.param1} ${formatHidUsage(binding.param2)}`;
    case "mod-tap":
      return `&mt ${formatHidUsage(binding.param1)} ${formatHidUsage(binding.param2)}`;
    case "sticky-key":
      return `&sk ${formatHidUsage(binding.param1)}`;
    case "sticky-layer":
      return `&sl ${binding.param1}`;
    case "momentary":
      return `&mo ${binding.param1}`;
    case "to-layer":
      return `&to ${binding.param1}`;
    case "toggle-layer":
      return `&tog ${binding.param1}`;
    case "bluetooth":
      return `&bt ${binding.param1} ${binding.param2}`;
    case "mouse-key":
      return `&mkp ${binding.param1}`;
    case "mouse-move":
      return `&mmv ${binding.param1}`;
    case "mouse-scroll":
      return `&msc ${binding.param1}`;
    case "caps-word":
      return "&caps_word";
    case "key-repeat":
      return "&key_repeat";
    case "reset":
      return "&sys_reset";
    case "bootloader":
      return "&bootloader";
    case "soft-off":
      return "&soft_off";
    case "studio-unlock":
      return "&studio_unlock";
    case "grave-escape":
      return "&gresc";
    case "transparent":
      return "&trans";
    case "none":
      return "&none";
    default:
      return formatCustomWebBehaviorBinding(role ?? "", binding);
  }
}

function formatCustomWebBehaviorBinding(displayName: string, binding: BehaviorBinding): string {
  const name = customBehaviorNameFromDisplayName(displayName);
  if (!name) {
    return `&unknown ${binding.behaviorId} ${binding.param1} ${binding.param2}`;
  }
  if (binding.param2 !== 0) {
    return `&${name} ${binding.param1} ${binding.param2}`;
  }
  if (binding.param1 !== 0) {
    return `&${name} ${binding.param1}`;
  }
  return `&${name}`;
}

function customBehaviorNameFromDisplayName(displayName: string): string | null {
  const name = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return /^[a-z_]/.test(name) ? name : null;
}

function parseWebBinding(binding: string): BehaviorBinding {
  const parts = binding.trim().split(/\s+/);
  const behavior = parts[0] ?? "";

  switch (behavior) {
    case "&kp":
      return behaviorBinding("key", parseHidUsage(requiredPart(parts, 1, "key")));
    case "&kt":
      return behaviorBinding("key-toggle", parseHidUsage(requiredPart(parts, 1, "key")));
    case "&lt":
      return behaviorBinding("layer-tap", parseInteger(requiredPart(parts, 1, "layer")), parseHidUsage(requiredPart(parts, 2, "tap key")));
    case "&mt":
      return behaviorBinding("mod-tap", parseHidUsage(requiredPart(parts, 1, "hold key")), parseHidUsage(requiredPart(parts, 2, "tap key")));
    case "&sk":
      return behaviorBinding("sticky-key", parseHidUsage(requiredPart(parts, 1, "key")));
    case "&sl":
      return behaviorBinding("sticky-layer", parseInteger(requiredPart(parts, 1, "layer")));
    case "&mo":
      return behaviorBinding("momentary", parseInteger(requiredPart(parts, 1, "layer")));
    case "&to":
      return behaviorBinding("to-layer", parseInteger(requiredPart(parts, 1, "layer")));
    case "&tog":
      return behaviorBinding("toggle-layer", parseInteger(requiredPart(parts, 1, "layer")));
    case "&bt":
      return behaviorBinding("bluetooth", parseBtCommand(requiredPart(parts, 1, "command")), parseInteger(parts[2] ?? "0"));
    case "&mkp":
      return behaviorBinding("mouse-key", parseInteger(requiredPart(parts, 1, "value")));
    case "&mmv":
      return behaviorBinding("mouse-move", parseInteger(requiredPart(parts, 1, "value")));
    case "&msc":
      return behaviorBinding("mouse-scroll", parseInteger(requiredPart(parts, 1, "value")));
    case "&caps_word":
      return behaviorBinding("caps-word");
    case "&key_repeat":
      return behaviorBinding("key-repeat");
    case "&sys_reset":
      return behaviorBinding("reset");
    case "&bootloader":
      return behaviorBinding("bootloader");
    case "&soft_off":
      return behaviorBinding("soft-off");
    case "&studio_unlock":
      return behaviorBinding("studio-unlock");
    case "&gresc":
      return behaviorBinding("grave-escape");
    case "&trans":
      return behaviorBinding("transparent");
    case "&none":
      return behaviorBinding("none");
    default:
      throw new Error(`${behavior || binding} is not supported by Web Serial Direct Mode yet`);
  }
}

function behaviorBinding(role: string, param1 = 0, param2 = 0): BehaviorBinding {
  const behaviorId = behaviorIdByRole.get(role);
  if (behaviorId === undefined) {
    throw new Error(`Device firmware does not expose behavior: ${role}`);
  }
  return { behaviorId, param1, param2 };
}

function roleFromDisplayName(displayName: string): string | undefined {
  switch (displayName.trim().toLowerCase()) {
    case "key press":
      return "key";
    case "key toggle":
      return "key-toggle";
    case "layer-tap":
      return "layer-tap";
    case "mod-tap":
      return "mod-tap";
    case "sticky key":
      return "sticky-key";
    case "sticky layer":
      return "sticky-layer";
    case "momentary layer":
      return "momentary";
    case "to layer":
      return "to-layer";
    case "toggle layer":
      return "toggle-layer";
    case "bluetooth":
      return "bluetooth";
    case "mouse key press":
      return "mouse-key";
    case "mouse move":
    case "mouse_move":
      return "mouse-move";
    case "mouse scroll":
    case "mouse_scroll":
      return "mouse-scroll";
    case "caps word":
      return "caps-word";
    case "key repeat":
      return "key-repeat";
    case "reset":
      return "reset";
    case "bootloader":
      return "bootloader";
    case "soft off":
    case "z_so_off":
      return "soft-off";
    case "studio unlock":
      return "studio-unlock";
    case "grave/escape":
      return "grave-escape";
    case "transparent":
      return "transparent";
    case "none":
      return "none";
    default:
      return undefined;
  }
}

const HID_USAGE_BY_NAME: Record<string, number> = {
  A: 0x00070004,
  B: 0x00070005,
  C: 0x00070006,
  D: 0x00070007,
  E: 0x00070008,
  F: 0x00070009,
  G: 0x0007000a,
  H: 0x0007000b,
  I: 0x0007000c,
  J: 0x0007000d,
  K: 0x0007000e,
  L: 0x0007000f,
  M: 0x00070010,
  N: 0x00070011,
  O: 0x00070012,
  P: 0x00070013,
  Q: 0x00070014,
  R: 0x00070015,
  S: 0x00070016,
  T: 0x00070017,
  U: 0x00070018,
  V: 0x00070019,
  W: 0x0007001a,
  X: 0x0007001b,
  Y: 0x0007001c,
  Z: 0x0007001d,
  N1: 0x0007001e,
  N2: 0x0007001f,
  N3: 0x00070020,
  N4: 0x00070021,
  N5: 0x00070022,
  N6: 0x00070023,
  N7: 0x00070024,
  N8: 0x00070025,
  N9: 0x00070026,
  N0: 0x00070027,
  ENTER: 0x00070028,
  RET: 0x00070028,
  ESC: 0x00070029,
  BSPC: 0x0007002a,
  BKSP: 0x0007002a,
  TAB: 0x0007002b,
  SPACE: 0x0007002c,
  SPC: 0x0007002c,
  CAPS: 0x00070039,
  MINUS: 0x0007002d,
  EQUAL: 0x0007002e,
  LBKT: 0x0007002f,
  RBKT: 0x00070030,
  BSLH: 0x00070031,
  SEMI: 0x00070033,
  SCLN: 0x00070033,
  APOS: 0x00070034,
  GRAVE: 0x00070035,
  COMMA: 0x00070036,
  CMMA: 0x00070036,
  DOT: 0x00070037,
  SLASH: 0x00070038,
  F1: 0x0007003a,
  F2: 0x0007003b,
  F3: 0x0007003c,
  F4: 0x0007003d,
  F5: 0x0007003e,
  F6: 0x0007003f,
  F7: 0x00070040,
  F8: 0x00070041,
  F9: 0x00070042,
  F10: 0x00070043,
  F11: 0x00070044,
  F12: 0x00070045,
  PSCRN: 0x00070046,
  SCROLLLOCK: 0x00070047,
  PAUSE_BREAK: 0x00070048,
  INS: 0x00070049,
  HOME: 0x0007004a,
  PG_UP: 0x0007004b,
  DEL: 0x0007004c,
  END: 0x0007004d,
  PG_DN: 0x0007004e,
  RIGHT: 0x0007004f,
  LEFT: 0x00070050,
  DOWN: 0x00070051,
  UP: 0x00070052,
  F13: 0x00070068,
  F14: 0x00070069,
  F15: 0x0007006a,
  F16: 0x0007006b,
  F17: 0x0007006c,
  F18: 0x0007006d,
  F19: 0x0007006e,
  F20: 0x0007006f,
  F21: 0x00070070,
  F22: 0x00070071,
  F23: 0x00070072,
  F24: 0x00070073,
  LANG1: 0x00070090,
  LANG2: 0x00070091,
  LCTRL: 0x000700e0,
  LCTL: 0x000700e0,
  LSHFT: 0x000700e1,
  LSFT: 0x000700e1,
  LALT: 0x000700e2,
  LCMD: 0x000700e3,
  LGUI: 0x000700e3,
  RCTRL: 0x000700e4,
  RCTL: 0x000700e4,
  RSHFT: 0x000700e5,
  RSFT: 0x000700e5,
  RALT: 0x000700e6,
  RCMD: 0x000700e7,
  RGUI: 0x000700e7,
  C_PLAY_PAUSE: 0x000c00cd,
  C_NEXT: 0x000c00b5,
  C_PREV: 0x000c00b6,
  C_MUTE: 0x000c00e2,
  C_VOL_UP: 0x000c00e9,
  C_VOL_DN: 0x000c00ea,
};

const NAME_BY_HID_USAGE = Object.fromEntries(Object.entries(HID_USAGE_BY_NAME).map(([name, value]) => [value, name]));

function parseHidUsage(value: string): number {
  const direct = HID_USAGE_BY_NAME[value.toUpperCase()];
  if (direct !== undefined) {
    return direct;
  }
  if (/^0x[0-9a-f]+$/i.test(value)) {
    return normalizeHidUsage(Number.parseInt(value, 16));
  }
  throw new Error(`Unknown keycode: ${value}`);
}

function formatHidUsage(value: number): string {
  const normalized = normalizeHidUsage(value);
  return NAME_BY_HID_USAGE[normalized] ?? `0x${normalized.toString(16).padStart(8, "0")}`;
}

function normalizeHidUsage(value: number): number {
  const page = value & 0x00ff0000;
  if (page !== 0) {
    return value;
  }
  const modifiers = value & 0xff000000;
  const usage = value & 0x0000ffff;
  return modifiers | 0x00070000 | usage;
}

function requiredPart(parts: string[], index: number, label: string): string {
  const value = parts[index];
  if (!value) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected number: ${value}`);
  }
  return parsed;
}

function parseBtCommand(value: string): number {
  switch (value) {
    case "BT_CLR":
      return 0;
    case "BT_NXT":
      return 1;
    case "BT_PRV":
      return 2;
    case "BT_SEL":
      return 3;
    case "BT_CLR_ALL":
      return 4;
    case "BT_DISC":
      return 5;
    default:
      return parseInteger(value);
  }
}

function decodeSerial(serial?: Uint8Array): string {
  return serial ? new TextDecoder().decode(serial) : "";
}

function formatLockState(state?: LockState): string {
  switch (state) {
    case LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED:
      return "LOCKED";
    case LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED:
      return "UNLOCKED";
    default:
      return "unknown";
  }
}
