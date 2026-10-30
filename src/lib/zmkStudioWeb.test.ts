import { describe, expect, it, vi } from "vitest";
import { parseCustomWebBinding, parseHidUsage, toWebStudioNotification } from "./zmkStudioWeb";

// The published client package uses extensionless ESM imports that Node cannot
// resolve, so stub the transport layer; these tests only cover pure helpers.
vi.mock("@zmkfirmware/zmk-studio-ts-client", () => ({ call_rpc: vi.fn(), Request: {}, Response: {} }));
vi.mock("@zmkfirmware/zmk-studio-ts-client/framing", () => ({ get_decoder: vi.fn(), get_encoder: vi.fn() }));
vi.mock("@zmkfirmware/zmk-studio-ts-client/transport/serial", () => ({ connect: vi.fn() }));
vi.mock("@zmkfirmware/zmk-studio-ts-client/core", () => ({ LockState: {} }));
vi.mock("@zmkfirmware/zmk-studio-ts-client/keymap", () => ({ SetLayerBindingResponse: {} }));

describe("parseHidUsage", () => {
  it("accepts keycode aliases offered by the key picker", () => {
    expect(parseHidUsage("FSLH")).toBe(parseHidUsage("SLASH"));
    expect(parseHidUsage("APOSTROPHE")).toBe(parseHidUsage("APOS"));
    expect(parseHidUsage("LEFT_SHIFT")).toBe(0x000700e1);
    expect(parseHidUsage("RIGHT_META")).toBe(0x000700e7);
  });

  it("accepts implicit-modifier symbols", () => {
    expect(parseHidUsage("EXCL")).toBe(0x0207001e);
    expect(parseHidUsage("QMARK")).toBe(0x02070038);
  });

  it("accepts ZMK modifier functions", () => {
    expect(parseHidUsage("LS(N1)")).toBe(0x0207001e);
    expect(parseHidUsage("LG(LS(N4))")).toBe(0x0a070021);
    expect(parseHidUsage("RG(A)")).toBe(0x80070004);
  });

  it("accepts JIS international keys", () => {
    expect(parseHidUsage("INT_YEN")).toBe(0x00070089);
    expect(parseHidUsage("INT_RO")).toBe(0x00070087);
  });

  it("keeps right-hand modifier bits unsigned", () => {
    expect(parseHidUsage("0x80000004")).toBe(0x80070004);
  });
});

describe("parseCustomWebBinding", () => {
  const catalog = new Map<number, string>([
    [1, "Key Press"],
    [22, "zoom_hold"],
    [30, "My Macro"],
  ]);

  it("finds firmware-specific behaviors by the name the device reports", () => {
    expect(parseCustomWebBinding(["&zoom_hold", "9"], catalog)).toEqual({ behaviorId: 22, param1: 9, param2: 0 });
    expect(parseCustomWebBinding(["&my_macro"], catalog)).toEqual({ behaviorId: 30, param1: 0, param2: 0 });
  });

  it("accepts keycode names as parameters", () => {
    expect(parseCustomWebBinding(["&zoom_hold", "A"], catalog)).toEqual({
      behaviorId: 22,
      param1: parseHidUsage("A"),
      param2: 0,
    });
  });

  it("writes raw unknown bindings back unchanged", () => {
    expect(parseCustomWebBinding(["&unknown", "22", "1", "2"], catalog)).toEqual({ behaviorId: 22, param1: 1, param2: 2 });
    expect(() => parseCustomWebBinding(["&unknown", "99"], catalog)).toThrow(/behavior id 99/);
  });

  it("returns null for behaviors the device does not have", () => {
    expect(parseCustomWebBinding(["&other_macro"], catalog)).toBeNull();
  });

  it("rejects extra parameters", () => {
    expect(() => parseCustomWebBinding(["&zoom_hold", "1", "2", "3"], catalog)).toThrow(/at most two/);
  });
});

describe("toWebStudioNotification", () => {
  it("maps lock and unsaved-changes notifications", () => {
    expect(toWebStudioNotification({ keymap: { unsavedChangesStatusChanged: true } })).toEqual({
      kind: "unsaved-changes",
      hasUnsavedChanges: true,
    });
    expect(toWebStudioNotification({ keymap: { unsavedChangesStatusChanged: false } })).toEqual({
      kind: "unsaved-changes",
      hasUnsavedChanges: false,
    });
    expect(toWebStudioNotification({})).toBeNull();
  });
});
