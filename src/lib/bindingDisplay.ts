import { normalizeKeycodeName } from "./keycodeAliases";

export type BindingDisplay = {
  badge?: string;
  label: string;
};

const KEY_LABELS: Record<string, string> = {
  "0X0207001E": "!",
  "0X0207001F": "@",
  "0X02070020": "#",
  "0X02070021": "$",
  "0X02070022": "%",
  "0X02070023": "^",
  "0X02070024": "&",
  "0X02070025": "*",
  "0X02070026": "(",
  "0X02070027": ")",
  "0X0207002D": "_",
  "0X0207002E": "+",
  "0X0207002F": "{",
  "0X02070030": "}",
  "0X02070031": "|",
  "0X02070033": ":",
  "0X02070034": "\"",
  "0X02070035": "~",
  "0X02070036": "<",
  "0X02070037": ">",
  "0X02070038": "?",
  SPACE: "SPC",
  SPC: "SPC",
  ENTER: "ENT",
  RET: "ENT",
  BSPC: "BSPC",
  BKSP: "BSPC",
  ESC: "ESC",
  TAB: "TAB",
  LSHFT: "LSFT",
  LSFT: "LSFT",
  RSHFT: "RSFT",
  RSFT: "RSFT",
  LCTRL: "LCTL",
  LCTL: "LCTL",
  RCTRL: "RCTL",
  RCTL: "RCTL",
  LCMD: "CMD",
  LGUI: "CMD",
  LALT: "ALT",
  CAPS: "CAPS",
  HOME: "HOME",
  END: "END",
  PG_UP: "PGUP",
  PG_DN: "PGDN",
  INS: "INS",
  PSCRN: "PSCR",
  SCROLLLOCK: "SLCK",
  PAUSE_BREAK: "PAUS",
  C_VOL_UP: "Vol+",
  C_VOL_DN: "Vol-",
  C_MUTE: "Mute",
  C_PLAY_PAUSE: "Play",
  C_NEXT: "Next",
  C_PREV: "Prev",
  COMMA: ",",
  DOT: ".",
  SEMI: ";",
  APOS: "'",
  SLASH: "/",
  GRAVE: "`",
  MINUS: "-",
  EQUAL: "=",
  PLUS: "+",
  EXCL: "!",
  BANG: "!",
  AT: "@",
  ATSN: "@",
  HASH: "#",
  DLLR: "$",
  PRCNT: "%",
  CARET: "^",
  CRRT: "^",
  AMPS: "&",
  ASTRK: "*",
  STAR: "*",
  LBKT: "[",
  RBKT: "]",
  LBRC: "{",
  RBRC: "}",
  LPAR: "(",
  RPAR: ")",
  UNDER: "_",
  PIPE: "|",
  BSLH: "\\",
  LT: "<",
  LABT: "<",
  GT: ">",
  QMARK: "?",
  DQT: "\"",
  COLON: ":",
  COLN: ":",
  TILDE: "~",
  TILD: "~",
};

export function bindingDisplay(binding: string): BindingDisplay {
  const parts = formatBindingForDisplay(binding).trim().split(/\s+/);
  const behavior = parts[0] ?? "";

  switch (behavior) {
    case "&kp":
      return { label: formatKey(parts.slice(1).join(" ")) };
    case "&kt":
      return { badge: "KT", label: formatKey(parts.slice(1).join(" ")) };
    case "&lt":
      return { badge: `L${parts[1] ?? "?"}`, label: formatKey(parts.slice(2).join(" ")) };
    case "&mt":
      return { badge: formatKey(parts[1] ?? "MT"), label: formatKey(parts.slice(2).join(" ")) };
    case "&sk":
      return { badge: "SK", label: formatKey(parts.slice(1).join(" ")) };
    case "&sl":
      return { badge: "SL", label: `L${parts[1] ?? "?"}` };
    case "&mo":
      return { badge: "MO", label: `L${parts[1] ?? "?"}` };
    case "&to":
      return { badge: "TO", label: `L${parts[1] ?? "?"}` };
    case "&tog":
      return { badge: "TG", label: `L${parts[1] ?? "?"}` };
    case "&mkp":
      return { badge: "M", label: parts[1]?.replace("MB", "B") ?? "BTN" };
    case "&mmv":
      return { badge: "MV", label: formatMouseMotion(parts[1]) };
    case "&msc":
      return { badge: "SC", label: formatMouseMotion(parts[1]) };
    case "&bt":
      return { badge: "BT", label: parts.slice(1).join(" ").replace("BT_SEL ", "S") };
    case "&sys_reset":
      return { label: "Reset" };
    case "&bootloader":
      return { label: "Boot" };
    case "&caps_word":
      return { label: "CapsW" };
    case "&key_repeat":
      return { label: "Repeat" };
    case "&soft_off":
      return { label: "Off" };
    case "&studio_unlock":
      return { label: "Unlock" };
    case "&gresc":
      return { label: "GESC" };
    case "&trans":
      return { label: "▽" };
    case "&none":
      return { label: "∅" };
    default:
      if (isCustomLayerTapBehavior(behavior)) {
        return { badge: `L${parts[1] ?? "?"}`, label: formatKey(parts.slice(2).join(" ")) };
      }
      if (behavior === "&zoom_hold") {
        return { badge: "ZH", label: parts.slice(1).join(" ") };
      }
      return { badge: behavior.replace("&", "").toUpperCase(), label: formatKey(parts.slice(1).join(" ")) };
  }
}

export function formatBindingForDisplay(binding: string): string {
  const parts = binding.trim().split(/\s+/);
  switch (parts[0]) {
    case "&kp":
    case "&kt":
    case "&sk":
      return formatBindingParts(parts, [1]);
    case "&lt":
      return formatBindingParts(parts, [2]);
    case "&mt":
      return formatBindingParts(parts, [1, 2]);
    case "&bt":
      return `&bt ${formatBtCommand(parts[1])} ${parts[2] ?? "0"}`;
    default:
      if (isCustomLayerTapBehavior(parts[0])) {
        return formatBindingParts(parts, [2]);
      }
      return binding;
  }
}

function formatBindingParts(parts: string[], keycodeIndexes: number[]): string {
  const keycodeIndexSet = new Set(keycodeIndexes);
  return parts
    .map((part, index) => (keycodeIndexSet.has(index) ? normalizeDisplayKeycode(part) : part))
    .join(" ");
}

function formatBtCommand(value?: string): string {
  switch (value) {
    case "0":
      return "BT_CLR";
    case "1":
      return "BT_NXT";
    case "2":
      return "BT_PRV";
    case "3":
      return "BT_SEL";
    case "4":
      return "BT_CLR_ALL";
    case "5":
      return "BT_DISC";
    default:
      return value ?? "BT_SEL";
  }
}

function formatKey(value: string): string {
  if (!value) {
    return "";
  }
  const normalizedValue = normalizeDisplayKeycode(value);
  return KEY_LABELS[normalizedValue] ?? normalizedValue.replace(/^N(?:UMBER_|UM_)?([0-9])$/, "$1");
}

function normalizeDisplayKeycode(value: string): string {
  const decimalHidUsage = parseDecimalHidUsage(value);
  return normalizeKeycodeName(decimalHidUsage ?? value);
}

function parseDecimalHidUsage(value: string): string | undefined {
  if (!/^\d+$/.test(value)) {
    return undefined;
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    return undefined;
  }
  return `0x${number.toString(16).padStart(8, "0")}`;
}

function isCustomLayerTapBehavior(behavior: string | undefined): boolean {
  return behavior?.toLowerCase().startsWith("&lt_") ?? false;
}

function formatMouseMotion(value?: string): string {
  switch (value) {
    case "0":
      return "0";
    case "1":
      return "X+";
    case "2":
      return "X-";
    case "3":
      return "Y+";
    case "4":
      return "Y-";
    default:
      return value ?? "?";
  }
}
