import { describe, expect, it } from "vitest";
import {
  addCombo,
  deleteCombo,
  formatBindings,
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
