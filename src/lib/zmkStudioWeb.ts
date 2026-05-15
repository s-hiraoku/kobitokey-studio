import { call_rpc, create_rpc_connection, RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import { connect as connectWebSerial } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { BehaviorBinding, Keymap, SetLayerBindingResponse } from "@zmkfirmware/zmk-studio-ts-client/keymap";

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
    requestDevice?: unknown;
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
let activeBehaviorCatalog: Map<number, string> = new Map();
let behaviorIdByRole: Map<string, number> = new Map();

export class WebTrackballRpcUnavailableError extends Error {
  constructor() {
    super("Trackball Direct RPC is available in the desktop app. The current Web client package does not expose the pointing RPC encoder yet.");
    this.name = "WebTrackballRpcUnavailableError";
  }
}

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
  const transport = kind === "usb" ? await connectWebSerial() : await connectWebGattWithFallback();
  const connection = create_rpc_connection(transport, { signal: transport.abortController.signal });
  try {
    await call_rpc(connection, { core: { getDeviceInfo: true } });
    const catalog = await loadBehaviorCatalog(connection).catch((error) => {
      throw new Error(
        `Connected, but the device did not allow reading behaviors. Press the Studio Unlock key on the keyboard, then reconnect. (${formatWebError(error)})`,
      );
    });
    activeConnection = connection;
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

  const requestDevice = bluetooth.requestDevice as (options: Record<string, unknown>) => Promise<WebBluetoothDevice>;
  const device = await requestDevice({
    filters: [
      { services: [serviceUuid] },
      { namePrefix: "KobitoKey" },
      { namePrefix: "Conductor" },
      { namePrefix: "ZMK" },
    ],
    optionalServices: [serviceUuid],
  }).catch((error) => {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      throw new Error("Bluetooth device was not selected. Put the keyboard in pairing/advertising mode and try again.");
    }
    throw error;
  });

  if (!device.gatt) {
    throw new Error("Selected Bluetooth device does not expose GATT.");
  }

  if (!device.gatt.connected) {
    await device.gatt.connect();
  }
  const service = await device.gatt.getPrimaryService(serviceUuid);
  const characteristic = await service.getCharacteristic(rpcCharacteristicUuid);
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

export async function readWebTrackballSettings(): Promise<DirectTrackballSettings> {
  throw new WebTrackballRpcUnavailableError();
}

export async function writeWebTrackballSettings(settings: DirectTrackballSettings): Promise<DirectTrackballSettings> {
  return Promise.reject(new WebTrackballRpcUnavailableError());
}

function resetWebStudioState() {
  activeConnection = null;
  activeBehaviorCatalog = new Map();
  behaviorIdByRole = new Map();
}

function requireConnection(): RpcConnection {
  if (!activeConnection) {
    throw new Error("No Web Studio device is connected");
  }
  return activeConnection;
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
      return `&unknown ${binding.behaviorId} ${binding.param1} ${binding.param2}`;
  }
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
    case "BT_SEL":
      return 1;
    case "BT_NXT":
      return 2;
    case "BT_PRV":
      return 3;
    case "BT_CLR_ALL":
      return 4;
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
