import { describe, expect, it, vi } from "vitest";
import { parseHidUsage } from "./zmkStudioWeb";

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

  it("keeps right-hand modifier bits unsigned", () => {
    expect(parseHidUsage("0x80000004")).toBe(0x80070004);
  });
});
