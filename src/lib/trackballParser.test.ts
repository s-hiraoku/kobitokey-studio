import { describe, expect, it } from "vitest";
import { parseTrackballSettings, updateBlockNumberSetting, updateNumberSetting } from "./trackballParser";

const leftOverlay = `
&i2c0 {
    tb_left: trackball@0 {
        cpi = <200>;
    };
};

pointer_accel {
    min-factor = <800>;
    max-factor = <2500>;
    speed-threshold = <1400>;
    acceleration-exponent = <3>;
};

pointer_accel_right {
    min-factor = <620>;
    max-factor = <2200>;
    speed-threshold = <2500>;
    acceleration-exponent = <3>;
};

gesture_keybind { threshold = <4>; };
tab_keybind { threshold = <5>; };
desktop_keybind { threshold = <8>; };
`;

const rightOverlay = `
&i2c0 {
    tb_right: trackball@0 {
        cpi = <700>;
    };
};
`;

describe("trackball parser", () => {
  it("reads left and right trackball settings", () => {
    expect(parseTrackballSettings(leftOverlay, rightOverlay)).toEqual({
      leftCpi: 200,
      rightCpi: 700,
      pointerMinFactor: 800,
      pointerMaxFactor: 2500,
      pointerSpeedThreshold: 1400,
      pointerAccelerationExponent: 3,
      rightPointerMinFactor: 620,
      rightPointerMaxFactor: 2200,
      rightPointerSpeedThreshold: 2500,
      rightPointerAccelerationExponent: 3,
      gestureThreshold: 4,
      tabThreshold: 5,
      desktopThreshold: 8,
    });
  });

  it("updates a numeric property", () => {
    expect(updateNumberSetting("cpi = <200>;", "cpi", 400)).toBe("cpi = <400>;");
  });

  it("updates a numeric property inside a named block only", () => {
    const updated = updateBlockNumberSetting(leftOverlay, "pointer_accel_right", "min-factor", 900);

    expect(parseTrackballSettings(updated, rightOverlay).pointerMinFactor).toBe(800);
    expect(parseTrackballSettings(updated, rightOverlay).rightPointerMinFactor).toBe(900);
  });
});
