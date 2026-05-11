export type BindingKind = "key" | "layer-tap" | "mod-tap" | "momentary" | "to-layer" | "mouse" | "bluetooth" | "raw";

export type BindingForm = {
  kind: BindingKind;
  behavior: string;
  primary: string;
  secondary: string;
  raw: string;
};

export function parseBindingForm(binding: string): BindingForm {
  const parts = binding.trim().split(/\s+/);
  const behavior = parts[0] ?? "";

  switch (behavior) {
    case "&kp":
      return form("key", behavior, parts.slice(1).join(" "), "", binding);
    case "&lt":
      return form("layer-tap", behavior, parts[1] ?? "", parts.slice(2).join(" "), binding);
    case "&mt":
      return form("mod-tap", behavior, parts[1] ?? "", parts.slice(2).join(" "), binding);
    case "&mo":
      return form("momentary", behavior, parts[1] ?? "", "", binding);
    case "&to":
      return form("to-layer", behavior, parts[1] ?? "", "", binding);
    case "&mkp":
      return form("mouse", behavior, parts[1] ?? "", "", binding);
    case "&bt":
      return form("bluetooth", behavior, parts[1] ?? "", parts.slice(2).join(" "), binding);
    default:
      return form("raw", behavior, "", "", binding);
  }
}

export function buildBindingFromForm(formValue: BindingForm): string {
  const primary = formValue.primary.trim();
  const secondary = formValue.secondary.trim();

  switch (formValue.kind) {
    case "key":
      return `&kp ${primary}`.trim();
    case "layer-tap":
      return `&lt ${primary} ${secondary}`.trim();
    case "mod-tap":
      return `&mt ${primary} ${secondary}`.trim();
    case "momentary":
      return `&mo ${primary}`.trim();
    case "to-layer":
      return `&to ${primary}`.trim();
    case "mouse":
      return `&mkp ${primary}`.trim();
    case "bluetooth":
      return `&bt ${primary} ${secondary}`.trim();
    case "raw":
      return formValue.raw.trim();
  }
}

function form(
  kind: BindingKind,
  behavior: string,
  primary: string,
  secondary: string,
  raw: string,
): BindingForm {
  return { kind, behavior, primary, secondary, raw };
}
