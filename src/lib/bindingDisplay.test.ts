import { describe, expect, it } from "vitest";
import { bindingDisplay, formatBindingForDisplay } from "./bindingDisplay";

const shiftedHidLabels = [
  ["0x0207001e", "EXCL", "!"],
  ["0x0207001f", "AT", "@"],
  ["0x02070020", "HASH", "#"],
  ["0x02070021", "DLLR", "$"],
  ["0x02070022", "PRCNT", "%"],
  ["0x02070023", "CARET", "^"],
  ["0x02070024", "AMPS", "&"],
  ["0x02070025", "ASTRK", "*"],
  ["0x02070026", "LPAR", "("],
  ["0x02070027", "RPAR", ")"],
  ["0x0207002d", "UNDER", "_"],
  ["0x0207002e", "PLUS", "+"],
  ["0x0207002f", "LBRC", "{"],
  ["0x02070030", "RBRC", "}"],
  ["0x02070031", "PIPE", "|"],
  ["0x02070033", "COLON", ":"],
  ["0x02070034", "DQT", "\""],
  ["0x02070035", "TILDE", "~"],
  ["0x02070036", "LT", "<"],
  ["0x02070037", "GT", ">"],
  ["0x02070038", "QMARK", "?"],
] as const;

describe("bindingDisplay", () => {
  it.each(shiftedHidLabels)(
    "renders shifted HID hex usage %s as %s",
    (hidUsage, canonicalName, displayLabel) => {
      expect(bindingDisplay(`&kp ${hidUsage}`)).toEqual({ label: displayLabel });
      expect(formatBindingForDisplay(`&kp ${hidUsage}`)).toBe(`&kp ${canonicalName}`);
    },
  );

  it("renders shifted keycode aliases as readable symbols", () => {
    expect(bindingDisplay("&kp PLUS")).toEqual({ label: "+" });
    expect(bindingDisplay("&kp ASTRK")).toEqual({ label: "*" });
    expect(bindingDisplay("&kp QMARK")).toEqual({ label: "?" });
  });

  it("normalizes aliases in display-only binding text", () => {
    expect(formatBindingForDisplay("&kp 0x0207002e")).toBe("&kp PLUS");
    expect(formatBindingForDisplay("&kp 0x02070025")).toBe("&kp ASTRK");
    expect(formatBindingForDisplay("&mt LEFT_SHIFT RET")).toBe("&mt LSHFT ENTER");
    expect(formatBindingForDisplay("&lt 2 SPC")).toBe("&lt 2 SPACE");
    expect(formatBindingForDisplay("&bt 3 0")).toBe("&bt BT_SEL 0");
  });

  it("renders common Direct aliases with compact labels", () => {
    expect(bindingDisplay("&kp NUM_1")).toEqual({ label: "1" });
    expect(bindingDisplay("&kp RET")).toEqual({ label: "ENT" });
    expect(bindingDisplay("&lt 2 SPC")).toEqual({ badge: "L2", label: "SPC" });
  });

  it("renders custom Direct layer-tap thumb behaviors with readable key labels", () => {
    expect(bindingDisplay("&lt_left_thumb 1 458796")).toEqual({ badge: "L1", label: "SPC" });
    expect(bindingDisplay("&lt_right_thumb 2 458792")).toEqual({ badge: "L2", label: "ENT" });
    expect(bindingDisplay("&lt_right_thumb 3 458981")).toEqual({ badge: "L3", label: "RSFT" });
    expect(formatBindingForDisplay("&lt_left_thumb 1 458796")).toBe("&lt_left_thumb 1 SPACE");
  });

  it("renders zoom hold parameters as custom behavior values", () => {
    expect(bindingDisplay("&zoom_hold 9")).toEqual({ badge: "ZH", label: "L9" });
  });
});
