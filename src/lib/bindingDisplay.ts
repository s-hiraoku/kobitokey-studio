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
    case "&lt":
      return { badge: `L${parts[1] ?? "?"}`, label: formatKey(parts.slice(2).join(" ")) };
    case "&mt":
      return { badge: formatKey(parts[1] ?? "MT"), label: formatKey(parts.slice(2).join(" ")) };
    case "&mo":
      return { badge: "MO", label: `L${parts[1] ?? "?"}` };
    case "&to":
      return { badge: "TO", label: `L${parts[1] ?? "?"}` };
    case "&mkp":
      return { badge: "M", label: parts[1]?.replace("MB", "B") ?? "BTN" };
    case "&bt":
      return { badge: "BT", label: parts.slice(1).join(" ").replace("BT_SEL ", "S") };
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
