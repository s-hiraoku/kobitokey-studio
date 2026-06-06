import { describe, expect, it } from "vitest";
import {
  assertUf2BootloaderDirectory,
  isUf2BootloaderDirectory,
  type Uf2BootloaderDirectoryHandle,
} from "./uf2Bootloader";

function fakeDirectoryHandle(files: string[], name = "KOBITOKEY"): Uf2BootloaderDirectoryHandle {
  return {
    name,
    async getFileHandle(fileName: string) {
      if (files.includes(fileName)) {
        return {};
      }
      throw new DOMException("Not found", "NotFoundError");
    },
  };
}

describe("isUf2BootloaderDirectory", () => {
  it("accepts UF2 bootloader directories with INFO_UF2.TXT", async () => {
    await expect(isUf2BootloaderDirectory(fakeDirectoryHandle(["INFO_UF2.TXT"]))).resolves.toBe(true);
  });

  it("accepts UF2 bootloader directories with CURRENT.UF2", async () => {
    await expect(isUf2BootloaderDirectory(fakeDirectoryHandle(["CURRENT.UF2"]))).resolves.toBe(true);
  });

  it("rejects directories without UF2 bootloader markers", async () => {
    await expect(isUf2BootloaderDirectory(fakeDirectoryHandle(["KobitoKey_left.uf2"], "Downloads"))).resolves.toBe(false);
  });
});

describe("assertUf2BootloaderDirectory", () => {
  it("throws an actionable error for non-bootloader folders", async () => {
    await expect(assertUf2BootloaderDirectory(fakeDirectoryHandle([], "Downloads"))).rejects.toThrow(
      "Downloads",
    );
  });
});
