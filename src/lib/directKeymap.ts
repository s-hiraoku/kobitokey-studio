import { type KeymapCombo, type ParsedKeymap } from "./keymapParser";

const STUDIO_KEY_COUNT = 40;
const COMPARABLE_KEYCODE_ALIASES: Record<string, string> = {
  BKSP: "BSPC",
  CMMA: "COMMA",
  LCTL: "LCTRL",
  LGUI: "LCMD",
  LSFT: "LSHFT",
  RET: "ENTER",
  RCTL: "RCTRL",
  RGUI: "RCMD",
  RSFT: "RSHFT",
  SCLN: "SEMI",
  SPC: "SPACE",
};

export type StudioKeymap = {
  deviceName: string;
  serialNumber: string;
  lockState: string;
  hasUnsavedChanges: boolean;
  layers: StudioLayer[];
};

export type StudioLayer = {
  id: number;
  name: string;
  bindings: string[];
};

export type StudioComboSet = {
  combos: Array<{
    id: string;
    index: number;
    binding: string;
    keyPositions: number[];
    timeoutMs: number;
    requirePriorIdleMs: number;
    layerMask: number;
    slowRelease: boolean;
  }>;
  maxCombos: number;
};

export type DirectFirmwareKeyDiff = {
  layerIndex: number;
  layerName: string;
  keyIndex: number;
  firmwareBinding: string;
  directBinding: string;
};

export function firmwareCombosToStudioSet(combos: KeymapCombo[]): StudioComboSet {
  return {
    combos: combos.map((combo, index) => ({
      id: combo.id,
      index,
      binding: combo.binding,
      keyPositions: combo.keyPositions,
      timeoutMs: combo.timeoutMs || 50,
      requirePriorIdleMs: 0,
      layerMask: 0xffffffff,
      slowRelease: false,
    })),
    maxCombos: combos.length,
  };
}

export function studioKeymapToParsedKeymap(keymap: StudioKeymap, combos: KeymapCombo[]): ParsedKeymap {
  return {
    layers: keymap.layers.map((layer, index) => ({
      id: `direct_layer_${layer.id}`,
      label: layer.name || `Layer ${index}`,
      bindings: completeStudioBindings(layer.bindings),
      blockStart: index,
      blockEnd: index,
    })),
    combos,
  };
}

export function studioKeymapToKeymapSource(keymap: StudioKeymap): string {
  const layers = keymap.layers
    .map((layer, index) => {
      const id = sanitizeLayerId(layer.name || `layer_${index}`, index);
      return [
        `        ${id} {`,
        `            display-name = "${escapeDtsString(layer.name || `Layer ${index}`)}";`,
        "            bindings = <",
        formatStudioBindings(layer.bindings),
        "            >;",
        "        };",
      ].join("\n");
    })
    .join("\n\n");

  return ["/ {", "    keymap {", "        compatible = \"zmk,keymap\";", layers, "    };", "};"].join("\n");
}

export function diffDirectKeymapAgainstFirmware(
  directKeymap: StudioKeymap | null,
  firmwareKeymap: ParsedKeymap,
): DirectFirmwareKeyDiff[] {
  if (!directKeymap) {
    return [];
  }

  return directKeymap.layers.flatMap((directLayer, layerIndex) => {
    const firmwareLayer = firmwareKeymap.layers[layerIndex];
    if (!firmwareLayer) {
      return [];
    }

    const directBindings = completeStudioBindings(directLayer.bindings);
    const firmwareBindings = completeStudioBindings(firmwareLayer.bindings);

    return directBindings.flatMap((directBinding, keyIndex) => {
      const firmwareBinding = firmwareBindings[keyIndex] ?? "&none";
      if (normalizeComparableBinding(directBinding) === normalizeComparableBinding(firmwareBinding)) {
        return [];
      }

      return [
        {
          layerIndex,
          layerName: directLayer.name || firmwareLayer.label || `Layer ${layerIndex}`,
          keyIndex,
          firmwareBinding,
          directBinding,
        },
      ];
    });
  });
}

export function formatStudioBindings(bindings: string[]): string {
  const completeBindings = completeStudioBindings(bindings);
  const maxLength = Math.max(...completeBindings.map((binding) => binding.length), 7);

  return Array.from({ length: 4 }, (_, row) =>
    completeBindings
      .slice(row * 10, row * 10 + 10)
      .map((binding) => binding.padEnd(maxLength, " "))
      .join("  ")
      .trimEnd(),
  ).join("\n");
}

function normalizeComparableBinding(binding: string): string {
  const parts = normalizeDirectBindingForDisplay(binding).trim().split(/\s+/);
  switch (parts[0]) {
    case "&kp":
    case "&kt":
    case "&sk":
      return normalizeComparableParts(parts, [1]);
    case "&lt":
      return normalizeComparableParts(parts, [2]);
    case "&mt":
      return normalizeComparableParts(parts, [1, 2]);
    default:
      return parts.join(" ");
  }
}

function normalizeComparableParts(parts: string[], keycodeIndexes: number[]): string {
  const keycodeIndexSet = new Set(keycodeIndexes);
  return parts
    .map((part, index) => (keycodeIndexSet.has(index) ? normalizeComparableKeycode(part) : part))
    .join(" ");
}

function normalizeComparableKeycode(value: string): string {
  const upperValue = value.toUpperCase();
  return COMPARABLE_KEYCODE_ALIASES[upperValue] ?? upperValue;
}

export function completeStudioBindings(bindings: string[]): string[] {
  return Array.from({ length: STUDIO_KEY_COUNT }, (_, index) =>
    normalizeDirectBindingForDisplay(bindings[index] ?? "&none"),
  );
}

export function normalizeDirectBindingForDisplay(binding: string): string {
  const parts = binding.trim().split(/\s+/);
  if (parts[0] === "&bt") {
    return `&bt ${formatBtCommand(parts[1])} ${parts[2] ?? "0"}`;
  }
  if (parts[0] === "&mkp") {
    return `&mkp ${formatMouseButton(parts[1])}`;
  }
  return binding;
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

function formatMouseButton(value?: string): string {
  switch (value) {
    case "1":
      return "MB1";
    case "2":
      return "MB2";
    case "4":
      return "MB3";
    case "8":
      return "MB4";
    case "16":
      return "MB5";
    default:
      return value ?? "MB1";
  }
}

function sanitizeLayerId(name: string, index: number): string {
  const id = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return id || `layer_${index}`;
}

function escapeDtsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
