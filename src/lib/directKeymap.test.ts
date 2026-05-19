import { describe, expect, it } from "vitest";
import {
  completeStudioBindings,
  diffDirectKeymapAgainstFirmware,
  firmwareCombosToStudioSet,
  formatStudioBindings,
  normalizeDirectBindingForDisplay,
  studioKeymapToKeymapSource,
  studioKeymapToParsedKeymap,
} from "./directKeymap";
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
          { id: 0, name: "Base", bindings: ["&kp A", "&bt 3 0"] },
          { id: 1, name: "Raise", bindings: ["&kp C"] },
        ],
      },
      {
        layers: [
          {
            id: "default_layer",
            label: "Default",
            bindings: completeStudioBindings(["&kp A", "&bt BT_SEL 0"]),
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
});
