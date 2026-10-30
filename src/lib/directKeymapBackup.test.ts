import { describe, expect, it } from "vitest";
import type { StudioKeymap } from "./directKeymap";
import {
  createDirectKeymapBackup,
  directKeymapBackupFileName,
  parseDirectKeymapBackup,
  planDirectKeymapRestore,
} from "./directKeymapBackup";

function keymap(layers: StudioKeymap["layers"]): StudioKeymap {
  return {
    deviceName: "KobitoKey",
    serialNumber: "",
    lockState: "UNLOCKED",
    hasUnsavedChanges: false,
    availableLayers: 0,
    maxLayerNameLength: 20,
    layers,
  };
}

describe("Direct keymap backup", () => {
  const device = keymap([
    { id: 0, name: "Base", bindings: ["&kp A", "&kp B"] },
    { id: 1, name: "Lower", bindings: ["&trans", "&mo 2"] },
  ]);

  it("round-trips through JSON", () => {
    const backup = createDirectKeymapBackup(device, new Date("2026-10-30T12:34:56.789Z"));
    expect(parseDirectKeymapBackup(JSON.stringify(backup))).toEqual(backup);
    expect(directKeymapBackupFileName(backup)).toBe("kobitokey-direct-2026-10-30-12-34-56.json");
  });

  it("rejects files that are not a backup", () => {
    expect(() => parseDirectKeymapBackup("not json")).toThrow(/JSON/);
    expect(() => parseDirectKeymapBackup(JSON.stringify({ layers: [] }))).toThrow(/Direct バックアップ/);
    expect(() =>
      parseDirectKeymapBackup(
        JSON.stringify({ format: "kobitokey-direct-keymap", version: 1, layers: [{ name: "Base", bindings: ["kp A"] }] }),
      ),
    ).toThrow(/binding/);
  });

  it("plans only the keys and names that differ", () => {
    const backup = createDirectKeymapBackup(device);
    const changed = keymap([
      { id: 0, name: "Base", bindings: ["&kp A", "&kp C"] },
      { id: 1, name: "Fn", bindings: ["&trans", "&mo 2"] },
    ]);
    expect(planDirectKeymapRestore(backup, changed)).toEqual({
      keyWrites: [{ layerIndex: 0, layerId: 0, keyPosition: 1, binding: "&kp B" }],
      renames: [{ layerIndex: 1, layerId: 1, name: "Lower" }],
      missingLayerCount: 0,
      extraLayerCount: 0,
    });
    expect(planDirectKeymapRestore(backup, device).keyWrites).toEqual([]);
  });

  it("reports layers that do not line up", () => {
    const backup = createDirectKeymapBackup(device);
    const smaller = keymap([{ id: 0, name: "Base", bindings: ["&kp A", "&kp B"] }]);
    expect(planDirectKeymapRestore(backup, smaller)).toMatchObject({ missingLayerCount: 1, extraLayerCount: 0 });
  });
});
