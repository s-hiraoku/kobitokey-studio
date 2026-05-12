import { call_rpc, create_rpc_connection, RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import { connect } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { BehaviorBinding, Keymap, SetLayerBindingResponse } from "@zmkfirmware/zmk-studio-ts-client/keymap";

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
  label: string;
  keymap: WebStudioKeymap;
};

let activeConnection: RpcConnection | null = null;
let activeBehaviorCatalog: Map<number, string> = new Map();
let behaviorIdByRole: Map<string, number> = new Map();

export function supportsWebSerial(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export async function connectWebStudioDevice(): Promise<WebStudioSession> {
  const transport = await connect();
  activeConnection = create_rpc_connection(transport, { signal: transport.abortController.signal });
  activeBehaviorCatalog = await loadBehaviorCatalog(activeConnection);
  behaviorIdByRole = invertBehaviorCatalog(activeBehaviorCatalog);
  return {
    label: activeConnection.label,
    keymap: await readWebStudioKeymap(),
  };
}

export async function readWebStudioKeymap(): Promise<WebStudioKeymap> {
  const conn = requireConnection();
  const [deviceInfo, lockResponse, keymapResponse, unsavedResponse] = await Promise.all([
    call_rpc(conn, { core: { getDeviceInfo: true } }),
    call_rpc(conn, { core: { getLockState: true } }),
    call_rpc(conn, { keymap: { getKeymap: true } }),
    call_rpc(conn, { keymap: { checkUnsavedChanges: true } }),
  ]);
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

function requireConnection(): RpcConnection {
  if (!activeConnection) {
    throw new Error("No Web Serial Studio device is connected");
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
    case "layer-tap":
      return `&lt ${binding.param1} ${formatHidUsage(binding.param2)}`;
    case "mod-tap":
      return `&mt ${formatHidUsage(binding.param1)} ${formatHidUsage(binding.param2)}`;
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
    case "&lt":
      return behaviorBinding("layer-tap", parseInteger(requiredPart(parts, 1, "layer")), parseHidUsage(requiredPart(parts, 2, "tap key")));
    case "&mt":
      return behaviorBinding("mod-tap", parseHidUsage(requiredPart(parts, 1, "hold key")), parseHidUsage(requiredPart(parts, 2, "tap key")));
    case "&mo":
      return behaviorBinding("momentary", parseInteger(requiredPart(parts, 1, "layer")));
    case "&to":
      return behaviorBinding("to-layer", parseInteger(requiredPart(parts, 1, "layer")));
    case "&tog":
      return behaviorBinding("toggle-layer", parseInteger(requiredPart(parts, 1, "layer")));
    case "&bt":
      return behaviorBinding("bluetooth", parseBtCommand(requiredPart(parts, 1, "command")), parseInteger(requiredPart(parts, 2, "value")));
    case "&mkp":
      return behaviorBinding("mouse-key", parseInteger(requiredPart(parts, 1, "value")));
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
    case "layer-tap":
      return "layer-tap";
    case "mod-tap":
      return "mod-tap";
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
  DEL: 0x0007004c,
  RIGHT: 0x0007004f,
  LEFT: 0x00070050,
  DOWN: 0x00070051,
  UP: 0x00070052,
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
};

const NAME_BY_HID_USAGE = Object.fromEntries(Object.entries(HID_USAGE_BY_NAME).map(([name, value]) => [value, name]));

function parseHidUsage(value: string): number {
  const direct = HID_USAGE_BY_NAME[value.toUpperCase()];
  if (direct !== undefined) {
    return direct;
  }
  if (/^0x[0-9a-f]+$/i.test(value)) {
    return Number.parseInt(value, 16);
  }
  throw new Error(`Unknown keycode: ${value}`);
}

function formatHidUsage(value: number): string {
  return NAME_BY_HID_USAGE[value] ?? `0x${value.toString(16).padStart(8, "0")}`;
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
