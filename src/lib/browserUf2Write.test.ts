import { describe, expect, it, vi } from "vitest";
import { writeBrowserUf2ToDirectoryHandle } from "./browserUf2Write";

type FakeWritable = {
  close: ReturnType<typeof vi.fn<() => Promise<void>>>;
  write: ReturnType<typeof vi.fn<(data: BufferSource) => Promise<void>>>;
};

function fakeWritable({
  closeError,
  writeError,
}: {
  closeError?: unknown;
  writeError?: unknown;
} = {}): FakeWritable {
  return {
    close: vi.fn(async () => {
      if (closeError) throw closeError;
    }),
    write: vi.fn(async () => {
      if (writeError) throw writeError;
    }),
  };
}

function fakeDirectoryHandle(
  getFileHandle: ReturnType<typeof vi.fn<(name: string, options?: { create?: boolean }) => Promise<unknown>>>,
): FileSystemDirectoryHandle {
  return {
    getFileHandle,
    name: "KOBITOKEY",
    queryPermission: vi.fn(async () => "granted" as PermissionState),
  } as unknown as FileSystemDirectoryHandle;
}

function fakeFileHandle(writable: FakeWritable) {
  return {
    createWritable: vi.fn(async () => writable),
  };
}

describe("writeBrowserUf2ToDirectoryHandle", () => {
  it("treats bootloader eject during write as successful ambiguous completion", async () => {
    const writable = fakeWritable({
      writeError: new DOMException("A requested file or directory could not be found", "NotFoundError"),
    });
    const getFileHandle = vi.fn(async () => fakeFileHandle(writable));
    const handle = fakeDirectoryHandle(getFileHandle);

    await expect(
      writeBrowserUf2ToDirectoryHandle(handle, {
        bytes: new Uint8Array([1, 2, 3]),
        name: "firmware/settings_reset.uf2",
      }),
    ).resolves.toEqual({ ambiguousEject: true, attempts: 1 });
    expect(getFileHandle).toHaveBeenCalledTimes(1);
    expect(writable.close).toHaveBeenCalledTimes(1);
  });

  it("retries bootloader-like errors before a write is attempted", async () => {
    const writable = fakeWritable();
    const getFileHandle = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("Transient mount error", "NotFoundError"))
      .mockRejectedValueOnce(new DOMException("Transient mount error", "NotFoundError"))
      .mockResolvedValue(fakeFileHandle(writable));
    const handle = fakeDirectoryHandle(getFileHandle);

    await expect(
      writeBrowserUf2ToDirectoryHandle(handle, {
        bytes: new Uint8Array([4, 5, 6]),
        name: "KobitoKey_left.uf2",
      }),
    ).resolves.toEqual({ ambiguousEject: false, attempts: 3 });
    expect(getFileHandle).toHaveBeenCalledTimes(3);
    expect(writable.write).toHaveBeenCalledTimes(1);
  });

  it("treats bootloader eject during close as successful ambiguous completion", async () => {
    const writable = fakeWritable({
      closeError: new DOMException("The device was disconnected", "NetworkError"),
    });
    const handle = fakeDirectoryHandle(vi.fn(async () => fakeFileHandle(writable)));

    await expect(
      writeBrowserUf2ToDirectoryHandle(handle, {
        bytes: new Uint8Array([7, 8, 9]),
        name: "KobitoKey_right.uf2",
      }),
    ).resolves.toEqual({ ambiguousEject: true, attempts: 1 });
  });

  it("fails after retries when the bootloader handle is stale before writing", async () => {
    vi.useFakeTimers();
    try {
      const getFileHandle = vi.fn(async () => {
        throw new DOMException("The directory is gone", "NotFoundError");
      });
      const handle = fakeDirectoryHandle(getFileHandle);
      const result = writeBrowserUf2ToDirectoryHandle(handle, {
        bytes: new Uint8Array([10]),
        name: "settings_reset.uf2",
      });
      const rejection = expect(result).rejects.toThrow("UF2 copy failed after 3 attempts");

      await vi.runAllTimersAsync();

      await rejection;
      expect(getFileHandle).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
