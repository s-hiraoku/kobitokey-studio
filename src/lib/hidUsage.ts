import { KEYCODE_ALIASES, normalizeKeycodeName } from "./keycodeAliases";

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
  LANG3: 0x00070092,
  LANG4: 0x00070093,
  LANG5: 0x00070094,
  INT1: 0x00070087,
  INT_RO: 0x00070087,
  INT2: 0x00070088,
  INT_KATAKANAHIRAGANA: 0x00070088,
  INT3: 0x00070089,
  INT_YEN: 0x00070089,
  INT4: 0x0007008a,
  INT_HENKAN: 0x0007008a,
  INT5: 0x0007008b,
  INT_MUHENKAN: 0x0007008b,
  NON_US_HASH: 0x00070032,
  NON_US_BSLH: 0x00070064,
  K_CMENU: 0x00070065,
  K_APP: 0x00070065,
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
  C_PP: 0x000c00cd,
  C_PLAY_PAUSE: 0x000c00cd,
  C_NEXT: 0x000c00b5,
  C_PREV: 0x000c00b6,
  C_MUTE: 0x000c00e2,
  C_VOL_UP: 0x000c00e9,
  C_VOL_DN: 0x000c00ea,
};

const NAME_BY_HID_USAGE = Object.fromEntries(Object.entries(HID_USAGE_BY_NAME).map(([name, value]) => [value, name]));

// Shifted symbols such as EXCL only exist as implicit-modifier usages
// ("0X0207001E" → "EXCL") in the alias table, so invert those entries.
const HID_USAGE_BY_ALIAS_NAME: Record<string, number> = Object.fromEntries(
  Object.entries(KEYCODE_ALIASES)
    .filter(([usage]) => /^0X[0-9A-F]+$/.test(usage))
    .map(([usage, name]) => [name, Number.parseInt(usage, 16)]),
);

// ZMK modifier functions such as LS(N1) or LG(LS(N4)) set modifier bits in
// the top byte of the encoded usage.
const MODIFIER_FUNCTION_BITS: Record<string, number> = {
  LC: 0x01,
  LS: 0x02,
  LA: 0x04,
  LG: 0x08,
  RC: 0x10,
  RS: 0x20,
  RA: 0x40,
  RG: 0x80,
};

export function parseHidUsage(value: string): number {
  const modifierFunction = value.trim().match(/^([A-Za-z]{2})\((.+)\)$/);
  const modifierBits = modifierFunction ? MODIFIER_FUNCTION_BITS[modifierFunction[1].toUpperCase()] : undefined;
  if (modifierFunction && modifierBits !== undefined) {
    return (parseHidUsage(modifierFunction[2]) | (modifierBits << 24)) >>> 0;
  }
  const upperValue = value.toUpperCase();
  const normalizedValue = normalizeKeycodeName(upperValue);
  const direct =
    HID_USAGE_BY_NAME[upperValue] ?? HID_USAGE_BY_NAME[normalizedValue] ?? HID_USAGE_BY_ALIAS_NAME[normalizedValue];
  if (direct !== undefined) {
    return direct;
  }
  if (/^0x[0-9a-f]+$/i.test(value)) {
    return normalizeHidUsage(Number.parseInt(value, 16));
  }
  throw new Error(`Unknown keycode: ${value}`);
}

export function formatHidUsage(value: number): string {
  const normalized = normalizeHidUsage(value);
  return NAME_BY_HID_USAGE[normalized] ?? `0x${normalized.toString(16).padStart(8, "0")}`;
}

function normalizeHidUsage(value: number): number {
  const page = value & 0x00ff0000;
  if (page !== 0) {
    return value;
  }
  // Bitwise operators yield signed 32-bit ints; keep the result unsigned so
  // right-hand modifiers (e.g. RGUI = 0x80) do not turn negative.
  const modifiers = value & 0xff000000;
  const usage = value & 0x0000ffff;
  return (modifiers | 0x00070000 | usage) >>> 0;
}
