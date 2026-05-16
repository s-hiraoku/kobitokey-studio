import { describe, expect, it } from "vitest";
import { buildBindingFromForm, parseBindingForm } from "./bindingForm";

describe("binding form conversion", () => {
  it.each([
    ["&kp A", "key", "A", ""],
    ["&lt 2 SPACE", "layer-tap", "2", "SPACE"],
    ["&mt LCTRL A", "mod-tap", "LCTRL", "A"],
    ["&mo 3", "momentary", "3", ""],
    ["&to 0", "to-layer", "0", ""],
    ["&mkp MB1", "mouse", "MB1", ""],
    ["&bt BT_SEL 1", "bluetooth", "BT_SEL", "1"],
  ])("parses %s", (binding, kind, primary, secondary) => {
    expect(parseBindingForm(binding)).toMatchObject({ kind, primary, secondary, raw: binding });
  });

  it("keeps unsupported bindings editable as raw text", () => {
    expect(parseBindingForm("&custom VALUE")).toMatchObject({
      kind: "raw",
      behavior: "&custom",
      raw: "&custom VALUE",
    });
  });

  it("builds normalized bindings from structured form values", () => {
    expect(buildBindingFromForm(parseBindingForm("&lt 2 SPACE"))).toBe("&lt 2 SPACE");
    expect(buildBindingFromForm({ kind: "raw", behavior: "&custom", primary: "", secondary: "", raw: " &custom X " })).toBe("&custom X");
  });
});
