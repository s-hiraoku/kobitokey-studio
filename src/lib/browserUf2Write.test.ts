import { describe, expect, it, vi } from "vitest";
import { writeBrowserUf2ToDirectoryHandle } from "./browserUf2Write";
import { UF2_BOOTLOADER_MARKER_FILES } from "./uf2Bootloader";

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
  { driveStillMounted = () => true }: { driveStillMounted?: () => boolean } = {},
): FileSystemDirectoryHandle {
  return {
    getFileHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
      if ((UF2_BOOTLOADER_MARKER_FILES as readonly string[]).includes(name)) {
        if (driveStillMounted()) return {};
        throw new DOMException("The directory is gone", "NotFoundError");
      }
      return getFileHandle(name, options);
    }),
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
        ejectProbeDelayMs: 0,
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
        ejectProbeDelayMs: 0,
      }),
    ).resolves.toEqual({ ambiguousEject: false, attempts: 2 });
    expect(getFileHandle).toHaveBeenCalledTimes(2);
  });

  it("treats a write rejection with a vanished drive as a completed flash", async () => {
    const writable = fakeWritable({
      writeError: new DOMException("The device was disconnected", "NetworkError"),
    });
    const getFileHandle = vi.fn().mockResolvedValueOnce(fakeFileHandle(writable));
    const handle = fakeDirectoryHandle(getFileHandle, { driveStillMounted: () => false });

    await expect(
      writeBrowserUf2ToDirectoryHandle(handle, {
        bytes: new Uint8Array([1, 2, 3]),
        name: "firmware/settings_reset.uf2",
      }, {
        initialSettleMs: 0,
        retryDelaysMs: [0, 0],
        ejectProbeDelayMs: 0,
      }),
    ).resolves.toEqual({ ambiguousEject: true, attempts: 1 });
    expect(getFileHandle).toHaveBeenCalledTimes(1);
    expect(writable.write).toHaveBeenCalledTimes(1);
  });

  it("treats a drive that vanishes during retry as a completed flash once data was written", async () => {
    let mounted = true;
    const firstWritable = fakeWritable({
      writeError: new DOMException("The device was disconnected", "NetworkError"),
    });
    const getFileHandle = vi
      .fn()
      .mockResolvedValueOnce(fakeFileHandle(firstWritable))
      .mockImplementation(async () => {
        mounted = false;
        throw new DOMException("A requested file or directory could not be found", "NotFoundError");
      });
    const handle = fakeDirectoryHandle(getFileHandle, { driveStillMounted: () => mounted });

    await expect(
      writeBrowserUf2ToDirectoryHandle(handle, {
        bytes: new Uint8Array([1, 2, 3]),
        name: "firmware/settings_reset.uf2",
      }, {
        initialSettleMs: 0,
        retryDelaysMs: [0, 0],
        ejectProbeDelayMs: 0,
      }),
    ).resolves.toEqual({ ambiguousEject: true, attempts: 2 });
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
        ejectProbeDelayMs: 0,
      }),
    ).resolves.toEqual({ ambiguousEject: false, attempts: 3 });
    expect(getFileHandle).toHaveBeenCalledTimes(3);
    expect(writable.write).toHaveBeenCalledTimes(1);
  });

  it("treats bootloader eject during close with a vanished drive as successful ambiguous completion", async () => {
    const writable = fakeWritable({
      closeError: new DOMException("The device was disconnected", "NetworkError"),
    });
    const handle = fakeDirectoryHandle(vi.fn(async () => fakeFileHandle(writable)), {
      driveStillMounted: () => false,
    });

    await expect(
      writeBrowserUf2ToDirectoryHandle(handle, {
        bytes: new Uint8Array([7, 8, 9]),
        name: "KobitoKey_right.uf2",
      }, {
        initialSettleMs: 0,
        retryDelaysMs: [],
        ejectProbeDelayMs: 0,
      }),
    ).resolves.toEqual({ ambiguousEject: true, attempts: 1 });
  });

  it("retries a close rejection while the drive is still mounted instead of assuming success", async () => {
    const firstWritable = fakeWritable({
      closeError: new DOMException("The device was disconnected", "NetworkError"),
    });
    const secondWritable = fakeWritable();
    const getFileHandle = vi
      .fn()
      .mockResolvedValueOnce(fakeFileHandle(firstWritable))
      .mockResolvedValueOnce(fakeFileHandle(secondWritable));
    const handle = fakeDirectoryHandle(getFileHandle);

    await expect(
      writeBrowserUf2ToDirectoryHandle(handle, {
        bytes: new Uint8Array([7, 8, 9]),
        name: "KobitoKey_right.uf2",
      }, {
        initialSettleMs: 0,
        retryDelaysMs: [0],
        ejectProbeDelayMs: 0,
      }),
    ).resolves.toEqual({ ambiguousEject: false, attempts: 2 });
    expect(getFileHandle).toHaveBeenCalledTimes(2);
  });

  it("reports an incomplete flash when the drive vanishes before the final chunk is written", async () => {
    let writes = 0;
    const writable: FakeWritable = {
      close: vi.fn(async () => {}),
      write: vi.fn(async () => {
        writes += 1;
        if (writes >= 2) {
          throw new DOMException("The device was disconnected", "NetworkError");
        }
      }),
    };
    const getFileHandle = vi.fn().mockResolvedValue(fakeFileHandle(writable));
    const handle = fakeDirectoryHandle(getFileHandle, { driveStillMounted: () => false });

    await expect(
      writeBrowserUf2ToDirectoryHandle(handle, {
        bytes: new Uint8Array(10),
        name: "firmware/settings_reset.uf2",
      }, {
        initialSettleMs: 0,
        retryDelaysMs: [0, 0],
        ejectProbeDelayMs: 0,
        chunkBytes: 2,
      }),
    ).rejects.toThrow("UF2 の書き込みが途中で中断されました（2/10 bytes 送信後にドライブが消失）");
    expect(getFileHandle).toHaveBeenCalledTimes(1);
    expect(writable.write).toHaveBeenCalledTimes(2);
  });

  it("treats an eject during the final chunk with a vanished drive as a completed flash", async () => {
    let writes = 0;
    const writable: FakeWritable = {
      close: vi.fn(async () => {}),
      write: vi.fn(async () => {
        writes += 1;
        if (writes >= 5) {
          throw new DOMException("The device was disconnected", "NetworkError");
        }
      }),
    };
    const getFileHandle = vi.fn().mockResolvedValue(fakeFileHandle(writable));
    const handle = fakeDirectoryHandle(getFileHandle, { driveStillMounted: () => false });

    await expect(
      writeBrowserUf2ToDirectoryHandle(handle, {
        bytes: new Uint8Array(10),
        name: "KobitoKey_right.uf2",
      }, {
        initialSettleMs: 0,
        retryDelaysMs: [0, 0],
        ejectProbeDelayMs: 0,
        chunkBytes: 2,
      }),
    ).resolves.toEqual({ ambiguousEject: true, attempts: 1 });
    expect(writable.write).toHaveBeenCalledTimes(5);
  });

  it("retries a partial write while the drive is still mounted and can finish cleanly", async () => {
    let writes = 0;
    const firstWritable: FakeWritable = {
      close: vi.fn(async () => {}),
      write: vi.fn(async () => {
        writes += 1;
        if (writes >= 2) {
          throw new DOMException("The device was disconnected", "NetworkError");
        }
      }),
    };
    const secondWritable = fakeWritable();
    const getFileHandle = vi
      .fn()
      .mockResolvedValueOnce(fakeFileHandle(firstWritable))
      .mockResolvedValueOnce(fakeFileHandle(secondWritable));
    const handle = fakeDirectoryHandle(getFileHandle);

    await expect(
      writeBrowserUf2ToDirectoryHandle(handle, {
        bytes: new Uint8Array(10),
        name: "firmware/settings_reset.uf2",
      }, {
        initialSettleMs: 0,
        retryDelaysMs: [0],
        ejectProbeDelayMs: 0,
        chunkBytes: 2,
      }),
    ).resolves.toEqual({ ambiguousEject: false, attempts: 2 });
    expect(getFileHandle).toHaveBeenCalledTimes(2);
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
        ejectProbeDelayMs: 0,
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
