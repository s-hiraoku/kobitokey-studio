export type BindingDisplay = {
  badge?: string;
  label: string;
};

const KEY_LABELS: Record<string, string> = {
  SPACE: "SPC",
  ENTER: "ENT",
  BSPC: "BSPC",
  ESC: "ESC",
  TAB: "TAB",
  LSHFT: "LSFT",
  RSHFT: "RSFT",
  LCTRL: "LCTL",
  RCTRL: "RCTL",
  LCMD: "CMD",
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
  ASTRK: "*",
  LBKT: "[",
  RBKT: "]",
  LPAR: "(",
  RPAR: ")",
};

export function bindingDisplay(binding: string): BindingDisplay {
  const parts = binding.trim().split(/\s+/);
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
      return { badge: behavior.replace("&", "").toUpperCase(), label: formatKey(parts.slice(1).join(" ")) };
  }
}

function formatKey(value: string): string {
  if (!value) {
    return "";
  }
  return KEY_LABELS[value] ?? value.replace(/^N([0-9])$/, "$1");
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
