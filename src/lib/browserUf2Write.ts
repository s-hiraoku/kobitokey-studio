import type { GitHubArtifactUf2 } from "./githubFirmwareClient";
import { isUf2BootloaderDirectory } from "./uf2Bootloader";

export type BrowserUf2WriteResult = {
  ambiguousEject: boolean;
  attempts: number;
};

export const BROWSER_UF2_WRITE_INITIAL_SETTLE_MS = 1200;
export const BROWSER_UF2_WRITE_RETRY_DELAYS_MS = [750, 1500, 3000, 5000] as const;
export const BROWSER_UF2_WRITE_MAX_ATTEMPTS = BROWSER_UF2_WRITE_RETRY_DELAYS_MS.length + 1;
export const BROWSER_UF2_WRITE_EJECT_PROBE_DELAY_MS = 500;
export const BROWSER_UF2_WRITE_CHUNK_BYTES = 64 * 1024;

type BrowserUf2WritePhase = "open-file" | "open-writable" | "write" | "close";

type BrowserUf2WriteOptions = {
  initialSettleMs?: number;
  retryDelaysMs?: readonly number[];
  ejectProbeDelayMs?: number;
  chunkBytes?: number;
};

export async function writeBrowserUf2ToDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  file: GitHubArtifactUf2,
  options: BrowserUf2WriteOptions = {},
): Promise<BrowserUf2WriteResult> {
  await ensureWritablePermission(handle);
  const retryDelays = options.retryDelaysMs ?? BROWSER_UF2_WRITE_RETRY_DELAYS_MS;
  const maxAttempts = retryDelays.length + 1;
  const chunkBytes = Math.max(1, options.chunkBytes ?? BROWSER_UF2_WRITE_CHUNK_BYTES);
  const totalBytes = file.bytes.byteLength;
  const filename = file.name.split("/").pop() ?? file.name;
  let lastError: unknown = null;
  let lastPhase: BrowserUf2WritePhase = "open-file";
  let dataMayHaveReachedDevice = false;
  let allDataMayHaveReachedDevice = false;

  await delay(options.initialSettleMs ?? BROWSER_UF2_WRITE_INITIAL_SETTLE_MS);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let writable: FileSystemWritableFileStream | null = null;
    let phase: BrowserUf2WritePhase = "open-file";
    let writeCompleted = false;
    let bytesAccepted = 0;
    try {
      phase = "open-file";
      const fileHandle = await handle.getFileHandle(filename, { create: true });
      phase = "open-writable";
      writable = await (fileHandle as unknown as { createWritable: () => Promise<FileSystemWritableFileStream> }).createWritable();
      phase = "write";
      // Stream the UF2 in chunks so an eject mid-write tells us how far the
      // data got. The OS may buffer ahead of the device but never behind it,
      // so a genuine "final block landed, bootloader rebooted" eject can only
      // surface once the final chunk has been handed to write().
      for (let offset = 0; offset < totalBytes; offset += chunkBytes) {
        const end = Math.min(offset + chunkBytes, totalBytes);
        dataMayHaveReachedDevice = true;
        if (end >= totalBytes) {
          allDataMayHaveReachedDevice = true;
        }
        await writable.write(arrayBufferFromBytes(file.bytes.subarray(offset, end)));
        bytesAccepted = end;
      }
      writeCompleted = true;
      phase = "close";
      await writable.close();
      return { ambiguousEject: false, attempts: attempt };
    } catch (error) {
      lastError = error;
      lastPhase = phase;
      if (writable && !writeCompleted) {
        await discardWritableQuietly(writable);
      }
      if (!isLikelyBootloaderEjectError(error)) {
        throw uf2WriteRetryError(error, attempt, phase);
      }
      if (dataMayHaveReachedDevice) {
        await delay(options.ejectProbeDelayMs ?? BROWSER_UF2_WRITE_EJECT_PROBE_DELAY_MS);
        if (!(await isUf2BootloaderDirectory(handle))) {
          if (allDataMayHaveReachedDevice) {
            // A UF2 bootloader flashes blocks as they stream in and reboots the
            // moment the final block lands, so the volume can vanish while the
            // final write() or close() is still pending. The drive is gone and
            // every byte went out: treat it as a completed flash.
            return { ambiguousEject: true, attempts: attempt };
          }
          // The drive vanished before the final chunk was handed off — the
          // bootloader cannot have received the whole image, so this is an
          // incomplete flash, not a completed one. Fail loudly instead of
          // reporting success or burning retries against a dead handle.
          throw new Error(
            `UF2 の書き込みが途中で中断されました（${bytesAccepted}/${totalBytes} bytes 送信後にドライブが消失）。書き込みは不完全の可能性が高いため、もう一度 bootloader に入れて同じ UF2 を書き込み直してください`,
          );
        }
      }
      if (attempt === maxAttempts) {
        throw uf2WriteRetryError(error, attempt, phase);
      }
      await delay(retryDelays[attempt - 1] ?? retryDelays[retryDelays.length - 1] ?? 0);
    }
  }

  throw uf2WriteRetryError(lastError, maxAttempts, lastPhase);
}

async function ensureWritablePermission(handle: FileSystemDirectoryHandle): Promise<void> {
  const h = handle as FileSystemDirectoryHandle & {
    queryPermission?: (opts: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (opts: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  };
  if (typeof h.queryPermission === "function") {
    const state = await h.queryPermission({ mode: "readwrite" });
    if (state === "granted") return;
  }
  if (typeof h.requestPermission === "function") {
    const next = await h.requestPermission({ mode: "readwrite" });
    if (next === "granted") return;
  }
  throw new Error("フォルダへの書き込み権限がありません");
}

function uf2WriteRetryError(error: unknown, attempts: number, phase: BrowserUf2WritePhase): Error {
  return new Error(`UF2 copy failed during ${phase} after ${attempts} attempts: ${formatError(error)}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function discardWritableQuietly(writable: FileSystemWritableFileStream) {
  try {
    const abort = (writable as unknown as { abort?: (reason?: unknown) => Promise<void> }).abort;
    if (typeof abort === "function") {
      await abort.call(writable, new Error("UF2 write did not complete"));
      return;
    }
    await writable.close();
  } catch {
    // Preserve the original write error.
  }
}

export function isLikelyBootloaderEjectError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return ["AbortError", "InvalidStateError", "NetworkError", "NotFoundError", "UnknownError"].includes(error.name);
  }

  return /abort|detached|disconnected|eject|invalidstate|network|no such file|not found|operation failed/i.test(formatError(error));
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function formatError(error: unknown): string {
  if (typeof error === "object" && error && "message" in error) {
    const message = String((error as { message: unknown }).message);
    if ("name" in error) {
      const name = String((error as { name: unknown }).name);
      return name && name !== "Error" ? `${name}: ${message}` : message;
    }
    return message;
  }
  return String(error);
}
