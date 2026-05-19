import {
  addCombo,
  deleteCombo,
  parseKeymap,
  updateCombo,
  updateLayerBinding,
  type KeymapCombo,
  type ParsedKeymap,
} from "./keymapParser";

const STUDIO_KEY_COUNT = 40;
const COMPARABLE_KEYCODE_ALIASES: Record<string, string> = {
  "0X00070028": "ENTER",
  "0X00070029": "ESC",
  "0X0007002A": "BSPC",
  "0X0007002B": "TAB",
  "0X0007002C": "SPACE",
  "0X0007001E": "N1",
  "0X0007001F": "N2",
  "0X00070020": "N3",
  "0X00070021": "N4",
  "0X00070022": "N5",
  "0X00070023": "N6",
  "0X00070024": "N7",
  "0X00070025": "N8",
  "0X00070026": "N9",
  "0X00070027": "N0",
  "0X0007002D": "MINUS",
  "0X0007002E": "EQUAL",
  "0X0007002F": "LBKT",
  "0X00070030": "RBKT",
  "0X00070031": "BSLH",
  "0X00070033": "SEMI",
  "0X00070034": "APOS",
  "0X00070035": "GRAVE",
  "0X00070036": "COMMA",
  "0X00070037": "DOT",
  "0X00070038": "SLASH",
  "0X00070039": "CAPS",
  "0X00070046": "PSCRN",
  "0X00070047": "SCROLLLOCK",
  "0X00070048": "PAUSE_BREAK",
  "0X00070049": "INS",
  "0X0007004A": "HOME",
  "0X0007004B": "PG_UP",
  "0X0007004C": "DEL",
  "0X0007004D": "END",
  "0X0007004E": "PG_DN",
  "0X0007004F": "RIGHT",
  "0X00070050": "LEFT",
  "0X00070051": "DOWN",
  "0X00070052": "UP",
  "0X000700E0": "LCTRL",
  "0X000700E1": "LSHFT",
  "0X000700E2": "LALT",
  "0X000700E3": "LCMD",
  "0X000700E4": "RCTRL",
  "0X000700E5": "RSHFT",
  "0X000700E6": "RALT",
  "0X000700E7": "RCMD",
  "0X000C00B5": "C_NEXT",
  "0X000C00B6": "C_PREV",
  "0X000C00CD": "C_PLAY_PAUSE",
  "0X000C00E2": "C_MUTE",
  "0X000C00E9": "C_VOL_UP",
  "0X000C00EA": "C_VOL_DN",
  "0X0207001E": "EXCL",
  "0X0207001F": "AT",
  "0X02070020": "HASH",
  "0X02070021": "DLLR",
  "0X02070022": "PRCNT",
  "0X02070023": "CARET",
  "0X02070024": "AMPS",
  "0X02070025": "ASTRK",
  "0X02070026": "LPAR",
  "0X02070027": "RPAR",
  "0X0207002D": "UNDER",
  "0X0207002E": "PLUS",
  "0X0207002F": "LBRC",
  "0X02070030": "RBRC",
  "0X02070031": "PIPE",
  "0X02070033": "COLON",
  "0X02070034": "DQT",
  "0X02070035": "TILDE",
  "0X02070036": "LT",
  "0X02070037": "GT",
  "0X02070038": "QMARK",
  AMPERSAND: "AMPS",
  APOSTROPHE: "APOS",
  ATSN: "AT",
  ASTERISK: "ASTRK",
  AT_SIGN: "AT",
  BKSP: "BSPC",
  BANG: "EXCL",
  BACKSLASH: "BSLH",
  BACKSPACE: "BSPC",
  CAPSLOCK: "CAPS",
  CLCK: "CAPS",
  CMMA: "COMMA",
  COLN: "COLON",
  CRRT: "CARET",
  DOLLAR: "DLLR",
  DOUBLE_QUOTES: "DQT",
  DOWN_ARROW: "DOWN",
  ESCAPE: "ESC",
  EQL: "EQUAL",
  EXCLAMATION: "EXCL",
  FSLH: "SLASH",
  GRAV: "GRAVE",
  GREATER_THAN: "GT",
  INSERT: "INS",
  LABT: "LT",
  LARW: "LEFT",
  LEFT_ALT: "LALT",
  LEFT_BRACE: "LBRC",
  LEFT_BRACKET: "LBKT",
  LEFT_COMMAND: "LCMD",
  LEFT_CONTROL: "LCTRL",
  LEFT_GUI: "LCMD",
  LEFT_META: "LCMD",
  LEFT_PARENTHESIS: "LPAR",
  LEFT_SHIFT: "LSHFT",
  LEFT_WIN: "LCMD",
  LESS_THAN: "LT",
  LCTL: "LCTRL",
  LGUI: "LCMD",
  LMETA: "LCMD",
  LSFT: "LSHFT",
  LSHIFT: "LSHFT",
  LWIN: "LCMD",
  M_NEXT: "C_NEXT",
  M_MUTE: "C_MUTE",
  M_PREV: "C_PREV",
  NUM_0: "N0",
  NUM_1: "N1",
  NUM_2: "N2",
  NUM_3: "N3",
  NUM_4: "N4",
  NUM_5: "N5",
  NUM_6: "N6",
  NUM_7: "N7",
  NUM_8: "N8",
  NUM_9: "N9",
  NUMBER_0: "N0",
  NUMBER_1: "N1",
  NUMBER_2: "N2",
  NUMBER_3: "N3",
  NUMBER_4: "N4",
  NUMBER_5: "N5",
  NUMBER_6: "N6",
  NUMBER_7: "N7",
  NUMBER_8: "N8",
  NUMBER_9: "N9",
  PAGE_DOWN: "PG_DN",
  PAGE_UP: "PG_UP",
  PERCENT: "PRCNT",
  PERIOD: "DOT",
  PLUS_SIGN: "PLUS",
  POUND: "HASH",
  PRSC: "PSCRN",
  PRINTSCREEN: "PSCRN",
  PRCT: "PRCNT",
  QUESTION: "QMARK",
  QUOT: "APOS",
  RARW: "RIGHT",
  RIGHT_ALT: "RALT",
  RIGHT_ARROW: "RIGHT",
  RIGHT_BRACE: "RBRC",
  RIGHT_BRACKET: "RBKT",
  RIGHT_COMMAND: "RCMD",
  RIGHT_CONTROL: "RCTRL",
  RIGHT_GUI: "RCMD",
  RIGHT_META: "RCMD",
  RIGHT_PARENTHESIS: "RPAR",
  RIGHT_SHIFT: "RSHFT",
  RIGHT_WIN: "RCMD",
  RET: "ENTER",
  RCTL: "RCTRL",
  RGUI: "RCMD",
  RMETA: "RCMD",
  RSFT: "RSHFT",
  RSHIFT: "RSHFT",
  RWIN: "RCMD",
  SCLN: "SEMI",
  SCLK: "SCROLLLOCK",
  SLCK: "SCROLLLOCK",
  SEMICOLON: "SEMI",
  SINGLE_QUOTE: "APOS",
  SQT: "APOS",
  SPC: "SPACE",
  TILD: "TILDE",
  UNDERSCORE: "UNDER",
  UP_ARROW: "UP",
  UARW: "UP",
  C_PREVIOUS: "C_PREV",
  C_VOLUME_DOWN: "C_VOL_DN",
  C_VOLUME_UP: "C_VOL_UP",
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

export type DirectFirmwareComboSnapshot = {
  id: string;
  binding: string;
  keyPositions: number[];
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
  return {
    id: combo.id,
    binding: normalizeDirectBindingForDisplay(combo.binding),
    keyPositions: [...combo.keyPositions],
    timeoutMs: combo.timeoutMs || 50,
  };
}

function sameComparableCombo(left: DirectFirmwareComboSnapshot, right: DirectFirmwareComboSnapshot): boolean {
  return (
    normalizeComparableBinding(left.binding) === normalizeComparableBinding(right.binding) &&
    left.keyPositions.join(" ") === right.keyPositions.join(" ") &&
    left.timeoutMs === right.timeoutMs
  );
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
