import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyDirectFirmwareComboDiffsToSource,
  applyDirectFirmwareKeyDiffsToSource,
  completeStudioBindings,
  diffDirectCombosAgainstFirmware,
  diffDirectKeymapAgainstFirmware,
  firmwareCombosToStudioSet,
  formatStudioBindings,
  normalizeDirectBindingForDisplay,
  studioKeymapToKeymapSource,
  studioKeymapToParsedKeymap,
} from "./directKeymap";
import { parseKeymap } from "./keymapParser";
import { KeymapCombo } from "./keymapParser";

const combos: KeymapCombo[] = [
  {
    id: "combo_tab",
    binding: "&kp TAB",
    keyPositions: [1, 2],
    timeoutMs: 0,
    blockStart: 10,
    blockEnd: 20,
  },
];

const desktopDisplayedKeycodes: Record<string, string> = {
  APOS: "APOSTROPHE",
  AT: "ATSN",
  CARET: "CRRT",
  COLON: "COLN",
  COMMA: "CMMA",
  C_MUTE: "M_MUTE",
  EQUAL: "EQL",
  GRAVE: "GRAV",
  LCMD: "LEFT_META",
  LSHFT: "LSHIFT",
  LT: "LABT",
  N0: "NUM_0",
  N1: "NUM_1",
  N2: "NUM_2",
  N3: "NUM_3",
  N4: "NUM_4",
  N5: "NUM_5",
  N6: "NUM_6",
  N7: "NUM_7",
  N8: "NUM_8",
  N9: "NUM_9",
  RSHFT: "RSHIFT",
  SLASH: "FSLH",
  SPACE: "SPC",
  TILDE: "TILD",
  UP: "UARW",
};

const webDisplayedKeycodes: Record<string, string> = {
  AMPS: "0x02070024",
  ASTRK: "0x02070025",
  AT: "0x0207001f",
  BSPC: "BKSP",
  CARET: "0x02070023",
  COLON: "0x02070033",
  COMMA: "CMMA",
  DLLR: "0x02070021",
  DQT: "0x02070034",
  ENTER: "RET",
  EXCL: "0x0207001e",
  HASH: "0x02070020",
  LBRC: "0x0207002f",
  LCMD: "LGUI",
  LPAR: "0x02070026",
  LSHFT: "LSFT",
  LT: "0x02070036",
  PIPE: "0x02070031",
  PLUS: "0x0207002e",
  PRCNT: "0x02070022",
  QMARK: "0x02070038",
  RBRC: "0x02070030",
  RPAR: "0x02070027",
  RSHFT: "RSFT",
  SPACE: "SPC",
  TILDE: "0x02070035",
  UNDER: "0x0207002d",
};

const studioDisplayedBindings: Record<string, string> = {
  "&zoom_hold 9": "&unknown 22 9 0",
  "&to 0": "&trans",
};

function comboFixtureSource(): string {
  return [
    "/ {",
    "    keymap {",
    "        compatible = \"zmk,keymap\";",
    "        default_layer {",
    "            bindings = <",
    completeStudioBindings(["&kp A"]).join("\n"),
    "            >;",
    "        };",
    "    };",
    "",
    "    combos {",
    "        compatible = \"zmk,combos\";",
    "",
    "        combo_tab {",
    "            timeout-ms = <35>;",
    "            key-positions = <1 2>;",
    "            bindings = <&kp ENTER>;",
    "        };",
    "",
    "        combo_old {",
    "            timeout-ms = <70>;",
    "            key-positions = <3 4>;",
    "            bindings = <&kp B>;",
    "        };",
    "    };",
    "};",
  ].join("\n");
}

function asDesktopDisplayedBinding(binding: string): string {
  return mapComparableBindingKeys(binding, desktopDisplayedKeycodes);
}

function asWebDisplayedBinding(binding: string): string {
  return mapComparableBindingKeys(binding, webDisplayedKeycodes);
}

function mapComparableBindingKeys(binding: string, keycodeMap: Record<string, string>): string {
  if (studioDisplayedBindings[binding]) {
    return studioDisplayedBindings[binding];
  }

  const parts = binding.trim().split(/\s+/);
  switch (parts[0]) {
    case "&kp":
    case "&kt":
    case "&sk":
      return [parts[0], keycodeMap[parts[1]] ?? parts[1]].join(" ");
    case "&lt":
      return [parts[0], parts[1], keycodeMap[parts[2]] ?? parts[2]].join(" ");
    case "&mt":
      return [parts[0], keycodeMap[parts[1]] ?? parts[1], keycodeMap[parts[2]] ?? parts[2]].join(" ");
    default:
      return binding;
  }
}

describe("direct keymap conversion", () => {
  it("normalizes compact Studio bindings for display", () => {
    expect(normalizeDirectBindingForDisplay("&bt 3 1")).toBe("&bt BT_SEL 1");
    expect(normalizeDirectBindingForDisplay("&bt 4")).toBe("&bt BT_CLR_ALL 0");
    expect(normalizeDirectBindingForDisplay("&mkp 16")).toBe("&mkp MB5");
    expect(normalizeDirectBindingForDisplay("&kp A")).toBe("&kp A");
  });

  it("fills missing Studio key bindings to the full KobitoKey matrix", () => {
    const bindings = completeStudioBindings(["&kp A", "&bt 3 0"]);

    expect(bindings).toHaveLength(40);
    expect(bindings.slice(0, 3)).toEqual(["&kp A", "&bt BT_SEL 0", "&none"]);
  });

  it("formats Studio bindings as four ten-key rows", () => {
    expect(formatStudioBindings(["&kp A"]).split("\n")).toHaveLength(4);
  });

  it("creates a parsed keymap from a live Studio keymap", () => {
    const parsed = studioKeymapToParsedKeymap(
      {
        deviceName: "KobitoKey",
        serialNumber: "123",
        lockState: "unlocked",
        hasUnsavedChanges: false,
        layers: [{ id: 7, name: "", bindings: ["&kp A"] }],
      },
      combos,
    );

    expect(parsed.layers[0]).toMatchObject({
      id: "direct_layer_7",
      label: "Layer 0",
      bindings: expect.arrayContaining(["&kp A", "&none"]),
    });
    expect(parsed.combos).toBe(combos);
  });

  it("converts firmware combos to a Studio combo set shape", () => {
    expect(firmwareCombosToStudioSet(combos)).toEqual({
      maxCombos: 1,
      combos: [
        {
          id: "combo_tab",
          index: 0,
          binding: "&kp TAB",
          keyPositions: [1, 2],
          timeoutMs: 50,
          requirePriorIdleMs: 0,
          layerMask: 0xffffffff,
          slowRelease: false,
        },
      ],
    });
  });

  it("can render a Studio keymap as keymap source text", () => {
    const source = studioKeymapToKeymapSource({
      deviceName: "KobitoKey",
      serialNumber: "123",
      lockState: "unlocked",
      hasUnsavedChanges: false,
      layers: [{ id: 0, name: "Base Layer", bindings: ["&kp A"] }],
    });

    expect(source).toContain("base_layer {");
    expect(source).toContain('display-name = "Base Layer";');
    expect(source).toContain("&kp A");
    expect(source).toContain("&none");
  });

  it("diffs Direct key bindings against firmware layers by layer and key position", () => {
    const diffs = diffDirectKeymapAgainstFirmware(
      {
        deviceName: "KobitoKey",
        serialNumber: "123",
        lockState: "unlocked",
        hasUnsavedChanges: false,
        layers: [
          {
            id: 0,
            name: "Base",
            bindings: [
              "&kp RET",
              "&bt 3 0",
              "&mt LSFT RET",
              "&lt 1 LGUI",
              "&kp 0x0207002e",
              "&kp 0x02070025",
              "&kp EXCLAMATION",
              "&kp NUMBER_1",
              "&kp LEFT_SHIFT",
              "&trans",
              "&unknown 22 9 0",
              "&lt_left_thumb 1 458796",
              "&lt_right_thumb 2 458792",
              "&lt_right_thumb 3 458981",
            ],
          },
          { id: 1, name: "Raise", bindings: ["&kp C"] },
        ],
      },
      {
        layers: [
          {
            id: "default_layer",
            label: "Default",
            bindings: completeStudioBindings([
              "&kp ENTER",
              "&bt BT_SEL 0",
              "&mt LSHFT ENTER",
              "&lt 1 LCMD",
              "&kp PLUS",
              "&kp ASTRK",
              "&kp EXCL",
              "&kp N1",
              "&kp LSHFT",
              "&to 0",
              "&zoom_hold 9",
              "&lt 1 SPACE",
              "&lt 2 ENTER",
              "&lt 3 RSHFT",
            ]),
            blockStart: 0,
            blockEnd: 1,
          },
          {
            id: "raise_layer",
            label: "Raise",
            bindings: completeStudioBindings(["&kp D"]),
            blockStart: 1,
            blockEnd: 2,
          },
        ],
        combos,
      },
    );

    expect(diffs).toEqual([
      {
        layerIndex: 1,
        layerName: "Raise",
        keyIndex: 0,
        firmwareBinding: "&kp D",
        directBinding: "&kp C",
      },
    ]);
  });

  it("diffs unknown custom bindings when behavior IDs differ", () => {
    const diffs = diffDirectKeymapAgainstFirmware(
      {
        deviceName: "KobitoKey",
        serialNumber: "123",
        lockState: "unlocked",
        hasUnsavedChanges: false,
        layers: [
          {
            id: 0,
            name: "Base",
            bindings: ["&unknown 23 9 0"],
          },
        ],
      },
      {
        layers: [
          {
            id: "default_layer",
            label: "Default",
            bindings: completeStudioBindings(["&zoom_hold 9"]),
            blockStart: 0,
            blockEnd: 1,
          },
        ],
        combos,
      },
    );

    expect(diffs).toEqual([
      {
        layerIndex: 0,
        layerName: "Base",
        keyIndex: 0,
        firmwareBinding: "&zoom_hold 9",
        directBinding: "&unknown 23 9 0",
      },
    ]);
  });

  it("does not diff fixture keymap aliases returned by the desktop Direct reader", () => {
    const firmwareSource = readFileSync("public/fixtures/KobitoKey.keymap", "utf8");
    const firmwareKeymap = parseKeymap(firmwareSource);
    const directKeymap = {
      deviceName: "KobitoKey",
      serialNumber: "123",
      lockState: "unlocked",
      hasUnsavedChanges: false,
      layers: firmwareKeymap.layers.map((layer, index) => ({
        id: index,
        name: layer.label,
        bindings: layer.bindings.map(asDesktopDisplayedBinding),
      })),
    };

    expect(diffDirectKeymapAgainstFirmware(directKeymap, firmwareKeymap)).toEqual([]);
  });

  it("does not diff fixture keymap aliases returned by the web Direct reader", () => {
    const firmwareSource = readFileSync("public/fixtures/KobitoKey.keymap", "utf8");
    const firmwareKeymap = parseKeymap(firmwareSource);
    const directKeymap = {
      deviceName: "KobitoKey",
      serialNumber: "123",
      lockState: "unlocked",
      hasUnsavedChanges: false,
      layers: firmwareKeymap.layers.map((layer, index) => ({
        id: index,
        name: layer.label,
        bindings: layer.bindings.map(asWebDisplayedBinding),
      })),
    };

    expect(diffDirectKeymapAgainstFirmware(directKeymap, firmwareKeymap)).toEqual([]);
  });

  it("does not diff custom layer-tap aliases returned with Studio behavior names", () => {
    const directKeymap = {
      deviceName: "KobitoKey",
      serialNumber: "123",
      lockState: "unlocked",
      hasUnsavedChanges: false,
      layers: [
        {
          id: 0,
          name: "Layer 0",
          bindings: completeStudioBindings([
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&lt_left_thumb 1 458796",
            "&none",
            "&none",
            "&lt_right_thumb 2 458792",
            "&lt_right_thumb 3 458981",
          ]),
        },
      ],
    };
    const firmwareKeymap = {
      layers: [
        {
          id: "default_layer",
          label: "Layer 0",
          bindings: completeStudioBindings([
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&none",
            "&lt_l 1 SPACE",
            "&none",
            "&none",
            "&lt_r 2 ENTER",
            "&lt_r 3 RSHFT",
          ]),
          blockStart: 0,
          blockEnd: 1,
        },
      ],
      combos,
    };

    expect(diffDirectKeymapAgainstFirmware(directKeymap, firmwareKeymap)).toEqual([]);
  });

  it("applies Direct key diffs back to firmware source", () => {
    const firmwareSource = [
      "/ {",
      "    keymap {",
      "        compatible = \"zmk,keymap\";",
      "        default_layer {",
      "            bindings = <",
      completeStudioBindings(["&kp A", "&bt BT_SEL 0"]).join("\n"),
      "            >;",
      "        };",
      "        raise_layer {",
      "            bindings = <",
      completeStudioBindings(["&kp D"]).join("\n"),
      "            >;",
      "        };",
      "    };",
      "};",
    ].join("\n");
    const directKeymap = {
      deviceName: "KobitoKey",
      serialNumber: "123",
      lockState: "unlocked",
      hasUnsavedChanges: false,
      layers: [
        { id: 0, name: "Base", bindings: ["&kp A", "&bt 3 0"] },
        { id: 1, name: "Raise", bindings: ["&kp C"] },
      ],
    };
    const diffs = diffDirectKeymapAgainstFirmware(directKeymap, parseKeymap(firmwareSource));

    const nextSource = applyDirectFirmwareKeyDiffsToSource(firmwareSource, diffs);

    expect(parseKeymap(nextSource).layers[1].bindings[0]).toBe("&kp C");
    expect(diffDirectKeymapAgainstFirmware(directKeymap, parseKeymap(nextSource))).toEqual([]);
  });

  it("diffs Direct combos against firmware combos by position", () => {
    const firmwareCombos = parseKeymap(comboFixtureSource()).combos;
    const directCombos: KeymapCombo[] = [
      {
        id: "direct_combo_1",
        binding: "&kp RET",
        keyPositions: [1, 2],
        timeoutMs: 35,
        blockStart: 0,
        blockEnd: 0,
      },
      {
        id: "direct_combo_2",
        binding: "&kp C",
        keyPositions: [3, 4],
        timeoutMs: 70,
        blockStart: 0,
        blockEnd: 0,
      },
      {
        id: "direct_combo_3",
        binding: "&kp D",
        keyPositions: [5, 6],
        timeoutMs: 80,
        blockStart: 0,
        blockEnd: 0,
      },
    ];

    expect(diffDirectCombosAgainstFirmware(directCombos, firmwareCombos)).toEqual([
      {
        comboIndex: 1,
        kind: "changed",
        firmwareCombo: {
          id: "combo_old",
          binding: "&kp B",
          keyPositions: [3, 4],
          timeoutMs: 70,
        },
        directCombo: {
          id: "direct_combo_2",
          binding: "&kp C",
          keyPositions: [3, 4],
          timeoutMs: 70,
        },
      },
      {
        comboIndex: 2,
        kind: "added",
        firmwareCombo: null,
        directCombo: {
          id: "direct_combo_3",
          binding: "&kp D",
          keyPositions: [5, 6],
          timeoutMs: 80,
        },
      },
    ]);
  });

  it("diffs Direct combo layer masks against firmware combo layer scopes", () => {
    const firmwareCombos = parseKeymap(
      comboFixtureSource().replace("bindings = <&kp ENTER>;", "layers = <1>;\n            bindings = <&kp ENTER>;"),
    ).combos;
    const directCombos: Array<KeymapCombo & { layerMask: number }> = [
      {
        id: "direct_combo_1",
        binding: "&kp RET",
        keyPositions: [1, 2],
        layers: [2],
        layerMask: 1 << 2,
        timeoutMs: 35,
        blockStart: 0,
        blockEnd: 0,
      },
    ];

    expect(firmwareCombosToStudioSet(firmwareCombos).combos[0].layerMask).toBe(1 << 1);
    expect(diffDirectCombosAgainstFirmware(directCombos, firmwareCombos)).toEqual([
      {
        comboIndex: 0,
        kind: "changed",
        firmwareCombo: {
          id: "combo_tab",
          binding: "&kp ENTER",
          keyPositions: [1, 2],
          layers: [1],
          timeoutMs: 35,
        },
        directCombo: {
          id: "direct_combo_1",
          binding: "&kp RET",
          keyPositions: [1, 2],
          layers: [2],
          timeoutMs: 35,
        },
      },
      {
        comboIndex: 1,
        kind: "removed",
        firmwareCombo: {
          id: "combo_old",
          binding: "&kp B",
          keyPositions: [3, 4],
          timeoutMs: 70,
        },
        directCombo: null,
      },
    ]);
  });

  it("treats empty Direct combo layers as all layers when comparing firmware combos", () => {
    const firmwareCombos = parseKeymap(comboFixtureSource()).combos;
    const directCombos: Array<KeymapCombo & { layerMask: number }> = [
      {
        id: "direct_combo_1",
        binding: "&kp RET",
        keyPositions: [1, 2],
        layers: [],
        layerMask: 0xffffffff,
        timeoutMs: 35,
        blockStart: 0,
        blockEnd: 0,
      },
      {
        id: "direct_combo_2",
        binding: "&kp B",
        keyPositions: [3, 4],
        layers: [],
        layerMask: 0xffffffff,
        timeoutMs: 70,
        blockStart: 0,
        blockEnd: 0,
      },
    ];

    expect(diffDirectCombosAgainstFirmware(directCombos, firmwareCombos)).toEqual([]);
  });

  it("applies Direct combo diffs back to firmware source", () => {
    const source = comboFixtureSource();
    const directCombos: KeymapCombo[] = [
      {
        id: "direct_combo_1",
        binding: "&kp RET",
        keyPositions: [1, 2],
        timeoutMs: 35,
        blockStart: 0,
        blockEnd: 0,
      },
      {
        id: "direct_combo_2",
        binding: "&kp C",
        keyPositions: [3, 4],
        timeoutMs: 70,
        blockStart: 0,
        blockEnd: 0,
      },
      {
        id: "direct_combo_3",
        binding: "&kp D",
        keyPositions: [5, 6],
        timeoutMs: 80,
        blockStart: 0,
        blockEnd: 0,
      },
    ];
    const diffs = diffDirectCombosAgainstFirmware(directCombos, parseKeymap(source).combos);

    const nextSource = applyDirectFirmwareComboDiffsToSource(source, diffs);

    const nextCombos = parseKeymap(nextSource).combos;
    expect(nextCombos.map((combo) => combo.id)).toEqual(["combo_tab", "combo_old", "direct_combo_3"]);
    expect(nextCombos.map((combo) => combo.binding)).toEqual(["&kp ENTER", "&kp C", "&kp D"]);
    expect(diffDirectCombosAgainstFirmware(directCombos, nextCombos)).toEqual([]);
  });

  it("applies Direct combo layer scope changes back to firmware source", () => {
    const source = comboFixtureSource().replace("bindings = <&kp ENTER>;", "layers = <1>;\n            bindings = <&kp ENTER>;");
    const directCombos: Array<KeymapCombo & { layerMask: number }> = [
      {
        id: "direct_combo_1",
        binding: "&kp RET",
        keyPositions: [1, 2],
        layerMask: 1 << 2,
        timeoutMs: 35,
        blockStart: 0,
        blockEnd: 0,
      },
      parseKeymap(source).combos[1] as KeymapCombo & { layerMask: number },
    ];
    directCombos[1].layerMask = 0xffffffff;
    const diffs = diffDirectCombosAgainstFirmware(directCombos, parseKeymap(source).combos);

    const nextSource = applyDirectFirmwareComboDiffsToSource(source, diffs);

    const nextCombos = parseKeymap(nextSource).combos;
    expect(nextCombos[0].layers).toEqual([2]);
    expect(nextSource).toContain("layers = <2>;");
    expect(diffDirectCombosAgainstFirmware(directCombos, nextCombos)).toEqual([]);
  });
});
