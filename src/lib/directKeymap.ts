import {
  addCombo,
  deleteCombo,
  parseKeymap,
  updateCombo,
  updateLayerBinding,
  type KeymapCombo,
  type ParsedKeymap,
} from "./keymapParser";
import { normalizeKeycodeName } from "./keycodeAliases";

const STUDIO_KEY_COUNT = 40;
const STANDARD_BEHAVIOR_BINDINGS = new Set([
  "&bl",
  "&bt",
  "&bootloader",
  "&caps_word",
  "&ext_power",
  "&gresc",
  "&key_repeat",
  "&kp",
  "&kt",
  "&lt",
  "&mkp",
  "&mmv",
  "&mo",
  "&msc",
  "&mt",
  "&none",
  "&out",
  "&rgb_ug",
  "&sk",
  "&sl",
  "&soft_off",
  "&studio_unlock",
  "&sys_reset",
  "&to",
  "&tog",
  "&trans",
]);

const CUSTOM_BEHAVIOR_IDS: Record<string, string> = {
  "&zoom_hold": "22",
};
const CUSTOM_LAYER_TAP_BEHAVIORS = new Set(["&lt_left_thumb", "&lt_right_thumb"]);
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

export type DirectFirmwareComboSnapshot = {
  id: string;
  binding: string;
  keyPositions: number[];
  layers?: number[];
  timeoutMs: number;
};

export type DirectFirmwareComboDiff = {
  comboIndex: number;
  kind: "added" | "removed" | "changed";
  firmwareCombo: DirectFirmwareComboSnapshot | null;
  directCombo: DirectFirmwareComboSnapshot | null;
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
      layerMask: comboLayersToMask(combo.layers),
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
      if (sameComparableBinding(directBinding, firmwareBinding)) {
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

export function applyDirectFirmwareKeyDiffsToSource(source: string, diffs: DirectFirmwareKeyDiff[]): string {
  return diffs.reduce((nextSource, diff) => {
    const layer = parseKeymap(nextSource).layers[diff.layerIndex];
    if (!layer) {
      return nextSource;
    }

    return updateLayerBinding(nextSource, layer, diff.keyIndex, diff.directBinding);
  }, source);
}

export function diffDirectCombosAgainstFirmware(
  directCombos: KeymapCombo[],
  firmwareCombos: KeymapCombo[],
): DirectFirmwareComboDiff[] {
  const maxCombos = Math.max(directCombos.length, firmwareCombos.length);
  return Array.from({ length: maxCombos }, (_, comboIndex): DirectFirmwareComboDiff | null => {
    const directCombo = directCombos[comboIndex] ? comboSnapshot(directCombos[comboIndex]) : null;
    const firmwareCombo = firmwareCombos[comboIndex] ? comboSnapshot(firmwareCombos[comboIndex]) : null;

    if (!directCombo && !firmwareCombo) {
      return null;
    }
    if (directCombo && !firmwareCombo) {
      return { comboIndex, kind: "added" as const, firmwareCombo, directCombo };
    }
    if (!directCombo && firmwareCombo) {
      return { comboIndex, kind: "removed" as const, firmwareCombo, directCombo };
    }
    if (directCombo && firmwareCombo && !sameComparableCombo(directCombo, firmwareCombo)) {
      return { comboIndex, kind: "changed" as const, firmwareCombo, directCombo };
    }
    return null;
  }).filter((diff): diff is DirectFirmwareComboDiff => diff !== null);
}

export function applyDirectFirmwareComboDiffsToSource(source: string, diffs: DirectFirmwareComboDiff[]): string {
  const changedSource = diffs
    .filter((diff) => diff.kind === "changed" && diff.directCombo)
    .reduce((nextSource, diff) => {
      const combo = parseKeymap(nextSource).combos[diff.comboIndex];
      if (!combo || !diff.directCombo) {
        return nextSource;
      }
      return updateCombo(nextSource, combo, {
        id: combo.id,
        binding: diff.directCombo.binding,
        keyPositions: diff.directCombo.keyPositions,
        layers: diff.directCombo.layers,
        timeoutMs: diff.directCombo.timeoutMs,
      });
    }, source);

  const removedSource = diffs
    .filter((diff) => diff.kind === "removed")
    .sort((a, b) => b.comboIndex - a.comboIndex)
    .reduce((nextSource, diff) => {
      const combo = parseKeymap(nextSource).combos[diff.comboIndex];
      return combo ? deleteCombo(nextSource, combo) : nextSource;
    }, changedSource);

  return diffs
    .filter((diff) => diff.kind === "added" && diff.directCombo)
    .reduce((nextSource, diff) => {
      const existingIds = parseKeymap(nextSource).combos.map((combo) => combo.id);
      const directCombo = diff.directCombo;
      if (!directCombo) {
        return nextSource;
      }
      return addCombo(nextSource, {
        id: uniqueComboId(sanitizeLayerId(directCombo.id, diff.comboIndex), existingIds),
        binding: directCombo.binding,
        keyPositions: directCombo.keyPositions,
        layers: directCombo.layers,
        timeoutMs: directCombo.timeoutMs,
      });
    }, removedSource);
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

function comboSnapshot(combo: KeymapCombo): DirectFirmwareComboSnapshot {
  const layers = combo.layers && combo.layers.length > 0 ? uniqueSortedNumbers(combo.layers) : layerMaskToLayers(combo);
  return {
    id: combo.id,
    binding: normalizeDirectBindingForDisplay(combo.binding),
    keyPositions: [...combo.keyPositions],
    ...(layers ? { layers } : {}),
    timeoutMs: combo.timeoutMs || 50,
  };
}

function sameComparableCombo(left: DirectFirmwareComboSnapshot, right: DirectFirmwareComboSnapshot): boolean {
  return (
    sameComparableBinding(left.binding, right.binding) &&
    left.keyPositions.join(" ") === right.keyPositions.join(" ") &&
    sameComparableLayers(left.layers, right.layers) &&
    left.timeoutMs === right.timeoutMs
  );
}

function sameComparableLayers(left: number[] | undefined, right: number[] | undefined): boolean {
  return (left?.join(" ") ?? "all") === (right?.join(" ") ?? "all");
}

function comboLayersToMask(layers: number[] | undefined): number {
  if (!layers || layers.length === 0) {
    return 0xffffffff;
  }
  return uniqueSortedNumbers(layers).reduce((mask, layer) => (layer >= 0 && layer < 32 ? mask | (1 << layer) : mask), 0) >>> 0;
}

function layerMaskToLayers(combo: KeymapCombo): number[] | undefined {
  const layerMask = "layerMask" in combo && typeof combo.layerMask === "number" ? combo.layerMask : 0xffffffff;
  if ((layerMask >>> 0) === 0xffffffff) {
    return undefined;
  }
  const layers: number[] = [];
  for (let layer = 0; layer < 32; layer += 1) {
    if ((layerMask & (1 << layer)) !== 0) {
      layers.push(layer);
    }
  }
  return layers;
}

function uniqueSortedNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value >= 0))].sort((left, right) => left - right);
}

function uniqueComboId(baseId: string, existingIds: string[]): string {
  const id = baseId || "direct_combo";
  if (!existingIds.includes(id)) {
    return id;
  }
  for (let index = 2; ; index += 1) {
    const candidate = `${id}_${index}`;
    if (!existingIds.includes(candidate)) {
      return candidate;
    }
  }
}

function sameComparableBinding(left: string, right: string): boolean {
  return (
    normalizeComparableBinding(left) === normalizeComparableBinding(right) ||
    sameUnknownCustomBinding(left, right) ||
    sameUnknownCustomBinding(right, left)
  );
}

function sameUnknownCustomBinding(unknownBinding: string, customBinding: string): boolean {
  const unknownParts = normalizeDirectBindingForDisplay(unknownBinding).trim().split(/\s+/);
  const customParts = normalizeDirectBindingForDisplay(customBinding).trim().split(/\s+/);
  if (unknownParts[0] !== "&unknown" || !isCustomComparableBinding(customParts[0])) {
    return false;
  }

  const unknownBehaviorId = unknownParts[1];
  if (CUSTOM_BEHAVIOR_IDS[customParts[0]] !== unknownBehaviorId) {
    return false;
  }

  const unknownParam1 = unknownParts[2] ?? "0";
  const unknownParam2 = unknownParts[3] ?? "0";
  if (customParts.length === 1) {
    return unknownParam1 === "0" && unknownParam2 === "0";
  }
  if (customParts.length === 2) {
    return customParts[1] === unknownParam1 && unknownParam2 === "0";
  }
  if (customParts.length === 3) {
    return customParts[1] === unknownParam1 && customParts[2] === unknownParam2;
  }
  return false;
}

function isCustomComparableBinding(bindingName: string | undefined): boolean {
  return Boolean(bindingName?.startsWith("&") && !STANDARD_BEHAVIOR_BINDINGS.has(bindingName));
}

function normalizeComparableBinding(binding: string): string {
  const parts = normalizeDirectBindingForDisplay(binding).trim().split(/\s+/);
  if (CUSTOM_LAYER_TAP_BEHAVIORS.has(parts[0])) {
    return normalizeComparableParts(["&lt", parts[1], parts[2]], [2]);
  }
  switch (parts[0]) {
    case "&kp":
    case "&kt":
    case "&sk":
      return normalizeComparableParts(parts, [1]);
    case "&lt":
      return normalizeComparableParts(parts, [2]);
    case "&mt":
      return normalizeComparableParts(parts, [1, 2]);
    case "&to":
      return parts[1] === "0" ? "&trans" : parts.join(" ");
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
