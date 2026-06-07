import type { GitHubArtifactUf2 } from "./githubFirmwareClient";

export type BrowserUf2WriteResult = {
  ambiguousEject: boolean;
  attempts: number;
};

export const BROWSER_UF2_WRITE_MAX_ATTEMPTS = 3;

export async function writeBrowserUf2ToDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  file: GitHubArtifactUf2,
): Promise<BrowserUf2WriteResult> {
  await ensureWritablePermission(handle);
  const filename = file.name.split("/").pop() ?? file.name;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= BROWSER_UF2_WRITE_MAX_ATTEMPTS; attempt += 1) {
    let writable: FileSystemWritableFileStream | null = null;
    let writeAttempted = false;
    try {
      const fileHandle = await handle.getFileHandle(filename, { create: true });
      writable = await (fileHandle as unknown as { createWritable: () => Promise<FileSystemWritableFileStream> }).createWritable();
      writeAttempted = true;
      await writable.write(arrayBufferFromBytes(file.bytes));
      try {
        await writable.close();
        return { ambiguousEject: false, attempts: attempt };
      } catch (error) {
        if (isLikelyBootloaderEjectError(error)) {
          return { ambiguousEject: true, attempts: attempt };
        }
        throw error;
      }
    } catch (error) {
      if (writable) {
        await closeWritableQuietly(writable);
      }
      if (writeAttempted && isLikelyBootloaderEjectError(error)) {
        return { ambiguousEject: true, attempts: attempt };
      }
      if (!isLikelyBootloaderEjectError(error) || attempt === BROWSER_UF2_WRITE_MAX_ATTEMPTS) {
        throw uf2WriteRetryError(error, attempt);
      }
      lastError = error;
      await delay(350);
    }
  }

  throw uf2WriteRetryError(lastError, BROWSER_UF2_WRITE_MAX_ATTEMPTS);
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

function uf2WriteRetryError(error: unknown, attempts: number): Error {
  return new Error(`UF2 copy failed after ${attempts} attempts: ${formatError(error)}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function closeWritableQuietly(writable: FileSystemWritableFileStream) {
  try {
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
