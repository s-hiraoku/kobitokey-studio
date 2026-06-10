import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addCombo,
  addLayer,
  deleteCombo,
  deleteLayer,
  findLayerReferenceSites,
  findOverlayLayerReferenceSites,
  formatBindings,
  nextLayerId,
  parseKeymap,
  tokenizeBindings,
  updateCombo,
  updateLayerBinding,
} from "./keymapParser";

const fortyBindings = Array.from({ length: 40 }, (_, index) => `&kp K${index + 1}`);

function sampleKeymap(): string {
  return `/ {
    keymap {
        compatible = "zmk,keymap";

        default_layer {
            label = "Base";
            bindings = <
${formatBindings(fortyBindings)}
            >;
        };

        fn_layer {
            bindings = <
${formatBindings(fortyBindings.map((binding) => binding.replace("&kp", "&mt LCTRL")))}
            >;
        };
    };

    combos {
        compatible = "zmk,combos";

        combo_tab {
            timeout-ms = <35>;
            key-positions = <1 2>;
            bindings = <&kp TAB>;
        };
    };
};`;
}

describe("parseKeymap", () => {
  it("parses complete layers and combos with source ranges", () => {
    const parsed = parseKeymap(sampleKeymap());

    expect(parsed.layers).toHaveLength(2);
    expect(parsed.layers[0]).toMatchObject({
      id: "default_layer",
      label: "Base",
      bindings: fortyBindings,
    });
    expect(parsed.layers[1].label).toBe("Layer 1");
    expect(parsed.combos).toEqual([
      expect.objectContaining({
        id: "combo_tab",
        binding: "&kp TAB",
        keyPositions: [1, 2],
        timeoutMs: 35,
      }),
    ]);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.combos[0].layers).toBeUndefined();
    expect(parsed.layers[0].blockEnd).toBeGreaterThan(parsed.layers[0].blockStart);
    expect(parsed.combos[0].blockEnd).toBeGreaterThan(parsed.combos[0].blockStart);
  });

  it("ignores incomplete layer blocks", () => {
    const parsed = parseKeymap(`/ {
      keymap {
        broken_layer {
          bindings = <&kp A &kp B>;
        };
      };
    };`);

    expect(parsed.layers).toEqual([]);
    expect(parsed.warnings).toEqual([
      expect.objectContaining({
        kind: "skipped-layer",
        id: "broken_layer",
        label: "Layer 0",
        expectedBindings: 40,
        actualBindings: 2,
      }),
    ]);
    expect(parsed.warnings[0].blockEnd).toBeGreaterThan(parsed.warnings[0].blockStart);
  });

  it("parses labelled keymap and combos nodes", () => {
    const source = sampleKeymap()
      .replace("keymap {", "my_keymap: keymap {")
      .replace("combos {", "my_combos: combos {");
    const parsed = parseKeymap(source);

    expect(parsed.layers).toHaveLength(2);
    expect(parsed.combos.map((combo) => combo.id)).toEqual(["combo_tab"]);
  });
});

describe("keymap updates", () => {
  it("updates one layer binding while preserving the rest of the source", () => {
    const source = sampleKeymap();
    const parsed = parseKeymap(source);
    const updated = updateLayerBinding(source, parsed.layers[0], 0, "A");

    const reparsed = parseKeymap(updated);
    expect(reparsed.layers[0].bindings[0]).toBe("&kp A");
    expect(reparsed.layers[0].bindings.slice(1)).toEqual(fortyBindings.slice(1));
    expect(reparsed.combos[0].binding).toBe("&kp TAB");
  });

  it("adds and deletes complete layer blocks", () => {
    const source = sampleKeymap();
    const parsed = parseKeymap(source);
    const id = nextLayerId(parsed.layers);
    const added = addLayer(source, {
      id,
      label: "Layer 2",
      bindings: Array.from({ length: 40 }, () => "&trans"),
    });

    const reparsed = parseKeymap(added);
    expect(reparsed.layers.map((layer) => layer.id)).toEqual(["default_layer", "fn_layer", id]);
    expect(reparsed.layers[2].label).toBe("Layer 2");
    expect(reparsed.layers[2].bindings).toEqual(Array.from({ length: 40 }, () => "&trans"));
    expect(reparsed.combos[0].binding).toBe("&kp TAB");

    const deleted = deleteLayer(added, reparsed.layers[2]);
    expect(parseKeymap(deleted).layers.map((layer) => layer.id)).toEqual(["default_layer", "fn_layer"]);
  });

  it("duplicates a layer by adding a block with copied bindings", () => {
    const source = sampleKeymap();
    const parsed = parseKeymap(source);
    const added = addLayer(source, {
      id: nextLayerId(parsed.layers, `${parsed.layers[0].id}_copy`),
      label: `${parsed.layers[0].label} Copy`,
      bindings: parsed.layers[0].bindings,
    });

    const duplicate = parseKeymap(added).layers[2];
    expect(duplicate.id).toBe("default_layer_copy");
    expect(duplicate.label).toBe("Base Copy");
    expect(duplicate.bindings).toEqual(parsed.layers[0].bindings);
  });

  it("finds references to a target layer before deletion", () => {
    const source = sampleKeymap()
      .replace("&kp K1", "&mo 1")
      .replace("bindings = <&kp TAB>;", "layers = <1>;\n            bindings = <&lt 1 TAB>;");
    const references = findLayerReferenceSites(parseKeymap(source), 1);

    expect(references).toEqual([
      {
        kind: "layer-binding",
        layerIndex: 0,
        keyIndex: 0,
        binding: "&mo 1",
      },
      {
        kind: "combo-binding",
        comboId: "combo_tab",
        binding: "&lt 1 TAB",
      },
      {
        kind: "combo-layers",
        comboId: "combo_tab",
        layers: [1],
      },
    ]);
  });

  it("finds overlay temp-layer references before deleting the target layer", () => {
    const references = findOverlayLayerReferenceSites({
      leftOverlay: `&tb_right_listener {
        input-processors = <&zip_temp_layer 3 5000>;
      };`,
      rightOverlay: `&tb_right_split {
        input-processors = <&zip_temp_layer 2 5000>;
      };`,
      targetLayerIndex: 3,
    });

    expect(references).toEqual([
      {
        kind: "overlay-temp-layer",
        overlay: "left",
        processor: "zip_temp_layer",
        layer: 3,
      },
    ]);
  });

  it("preserves combo layer scope when editing a combo", () => {
    const source = sampleKeymap().replace("bindings = <&kp TAB>;", "layers = <1>;\n            bindings = <&kp TAB>;");
    const combo = parseKeymap(source).combos[0];

    expect(combo.layers).toEqual([1]);

    const updated = updateCombo(source, combo, {
      id: "combo_esc",
      binding: "&kp ESC",
      keyPositions: [3, 4],
      timeoutMs: 50,
    });

    const reparsed = parseKeymap(updated);
    expect(reparsed.combos[0]).toMatchObject({
      id: "combo_esc",
      binding: "&kp ESC",
      keyPositions: [3, 4],
      layers: [1],
      timeoutMs: 50,
    });
    expect(updated).toContain("layers = <1>;");
  });

  it("updates, adds, and deletes combo blocks", () => {
    const source = sampleKeymap();
    const combo = parseKeymap(source).combos[0];

    const updated = updateCombo(source, combo, {
      id: "combo_esc",
      binding: "&kp ESC",
      keyPositions: [3, 4],
      timeoutMs: 50,
    });
    expect(parseKeymap(updated).combos[0]).toMatchObject({
      id: "combo_esc",
      binding: "&kp ESC",
      keyPositions: [3, 4],
      timeoutMs: 50,
    });

    const added = addCombo(updated, {
      id: "combo_enter",
      binding: "&kp ENTER",
      keyPositions: [5, 6],
      timeoutMs: 60,
    });
    expect(parseKeymap(added).combos.map((item) => item.id)).toEqual(["combo_esc", "combo_enter"]);

    const deleted = deleteCombo(added, parseKeymap(added).combos[0]);
    expect(parseKeymap(deleted).combos.map((item) => item.id)).toEqual(["combo_enter"]);
  });

  it("creates a combos node when adding the first combo", () => {
    const source = sampleKeymap().replace(/\n\n    combos \{[\s\S]*?\n    \};/, "");
    const added = addCombo(source, {
      id: "combo_first",
      binding: "&kp ESC",
      keyPositions: [38, 39],
      timeoutMs: 50,
    });

    expect(added).toContain('compatible = "zmk,combos";');
    expect(parseKeymap(added).combos).toEqual([
      expect.objectContaining({
        id: "combo_first",
        binding: "&kp ESC",
        keyPositions: [38, 39],
        timeoutMs: 50,
      }),
    ]);
  });

  it("adds and updates a combo in the bundled fixture keymap", () => {
    const source = readFileSync("public/fixtures/KobitoKey.keymap", "utf8");
    const parsed = parseKeymap(source);
    const added = addCombo(source, {
      id: "combo_custom_fixture",
      binding: "&kp ESC",
      keyPositions: [0, 1],
      timeoutMs: 50,
    });

    expect(added).toContain("        combo_custom_fixture {\n");
    expect(added).toContain("        };\n    };\n\n    keymap {");

    const addedCombo = parseKeymap(added).combos.find((combo) => combo.id === "combo_custom_fixture");
    expect(parseKeymap(added).combos).toHaveLength(parsed.combos.length + 1);
    expect(addedCombo).toMatchObject({
      binding: "&kp ESC",
      keyPositions: [0, 1],
      timeoutMs: 50,
    });

    const updated = updateCombo(added, addedCombo!, {
      id: "combo_custom_fixture",
      binding: "&kp TAB",
      keyPositions: [0, 1, 4],
      timeoutMs: 70,
    });
    expect(parseKeymap(updated).combos.find((combo) => combo.id === "combo_custom_fixture")).toMatchObject({
      binding: "&kp TAB",
      keyPositions: [0, 1, 4],
      timeoutMs: 70,
    });
  });
});

describe("binding formatting helpers", () => {
  it("groups behavior bindings with their parameters", () => {
    expect(tokenizeBindings("&kp A &lt 1 SPACE &bt BT_SEL 0")).toEqual([
      "&kp A",
      "&lt 1 SPACE",
      "&bt BT_SEL 0",
    ]);
  });

  it("formats bindings as four ten-key rows", () => {
    expect(formatBindings(fortyBindings).split("\n")).toHaveLength(4);
  });
});
