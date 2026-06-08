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
  it("retries bootloader-like write rejections instead of reporting success", async () => {
    const writables = [
      fakeWritable({ writeError: new DOMException("A requested file or directory could not be found", "NotFoundError") }),
      fakeWritable({ writeError: new DOMException("The device was disconnected", "NetworkError") }),
      fakeWritable({ writeError: new DOMException("The directory is gone", "NotFoundError") }),
    ];
    const getFileHandle = vi
      .fn()
      .mockResolvedValueOnce(fakeFileHandle(writables[0]))
      .mockResolvedValueOnce(fakeFileHandle(writables[1]))
      .mockResolvedValueOnce(fakeFileHandle(writables[2]));
    const handle = fakeDirectoryHandle(getFileHandle);

    await expect(
      writeBrowserUf2ToDirectoryHandle(handle, {
        bytes: new Uint8Array([1, 2, 3]),
        name: "firmware/settings_reset.uf2",
      }, {
        initialSettleMs: 0,
        retryDelaysMs: [0, 0],
      }),
    ).rejects.toThrow("UF2 copy failed during write after 3 attempts");
    expect(getFileHandle).toHaveBeenCalledTimes(3);
    expect(writables.map((writable) => writable.write).every((write) => write.mock.calls.length === 1)).toBe(true);
  });

  it("can recover from a transient write rejection before data is accepted", async () => {
    const firstWritable = fakeWritable({
      writeError: new DOMException("A requested file or directory could not be found", "NotFoundError"),
    });
    const secondWritable = fakeWritable();
    const getFileHandle = vi
      .fn()
      .mockResolvedValueOnce(fakeFileHandle(firstWritable))
      .mockResolvedValueOnce(fakeFileHandle(secondWritable));
    const handle = fakeDirectoryHandle(getFileHandle);

    await expect(
      writeBrowserUf2ToDirectoryHandle(handle, {
        bytes: new Uint8Array([1, 2, 3]),
        name: "firmware/settings_reset.uf2",
      }, {
        initialSettleMs: 0,
        retryDelaysMs: [0],
      }),
    ).resolves.toEqual({ ambiguousEject: false, attempts: 2 });
    expect(getFileHandle).toHaveBeenCalledTimes(2);
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
      }, {
        initialSettleMs: 0,
        retryDelaysMs: [0, 0],
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
      }, {
        initialSettleMs: 0,
        retryDelaysMs: [],
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
      }, {
        initialSettleMs: 0,
        retryDelaysMs: [100, 100],
      });
      const rejection = expect(result).rejects.toThrow("UF2 copy failed during open-file after 3 attempts");

      await vi.runAllTimersAsync();

      await rejection;
      expect(getFileHandle).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
