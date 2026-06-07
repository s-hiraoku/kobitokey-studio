import type { GitHubArtifactUf2 } from "./githubFirmwareClient";

export type BrowserUf2WriteResult = {
  ambiguousEject: boolean;
  attempts: number;
};

export const BROWSER_UF2_WRITE_INITIAL_SETTLE_MS = 1200;
export const BROWSER_UF2_WRITE_RETRY_DELAYS_MS = [750, 1500, 3000, 5000] as const;
export const BROWSER_UF2_WRITE_MAX_ATTEMPTS = BROWSER_UF2_WRITE_RETRY_DELAYS_MS.length + 1;

type BrowserUf2WritePhase = "open-file" | "open-writable" | "write" | "close";

type BrowserUf2WriteOptions = {
  initialSettleMs?: number;
  retryDelaysMs?: readonly number[];
};

export async function writeBrowserUf2ToDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  file: GitHubArtifactUf2,
  options: BrowserUf2WriteOptions = {},
): Promise<BrowserUf2WriteResult> {
  await ensureWritablePermission(handle);
  const retryDelays = options.retryDelaysMs ?? BROWSER_UF2_WRITE_RETRY_DELAYS_MS;
  const maxAttempts = retryDelays.length + 1;
  const filename = file.name.split("/").pop() ?? file.name;
  let lastError: unknown = null;
  let lastPhase: BrowserUf2WritePhase = "open-file";

  await delay(options.initialSettleMs ?? BROWSER_UF2_WRITE_INITIAL_SETTLE_MS);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let writable: FileSystemWritableFileStream | null = null;
    let phase: BrowserUf2WritePhase = "open-file";
    let writeCompleted = false;
    try {
      phase = "open-file";
      const fileHandle = await handle.getFileHandle(filename, { create: true });
      phase = "open-writable";
      writable = await (fileHandle as unknown as { createWritable: () => Promise<FileSystemWritableFileStream> }).createWritable();
      phase = "write";
      await writable.write(arrayBufferFromBytes(file.bytes));
      writeCompleted = true;
      try {
        phase = "close";
        await writable.close();
        return { ambiguousEject: false, attempts: attempt };
      } catch (error) {
        if (isLikelyBootloaderEjectError(error)) {
          return { ambiguousEject: true, attempts: attempt };
        }
        throw error;
      }
    } catch (error) {
      lastError = error;
      lastPhase = phase;
      if (writable && !writeCompleted) {
        await discardWritableQuietly(writable);
      }
      if (!isLikelyBootloaderEjectError(error) || attempt === maxAttempts) {
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
