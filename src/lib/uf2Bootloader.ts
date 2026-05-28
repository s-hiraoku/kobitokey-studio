export type Uf2BootloaderDirectoryHandle = {
  name?: string;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<unknown>;
};

export const UF2_BOOTLOADER_MARKER_FILES = ["INFO_UF2.TXT", "CURRENT.UF2"] as const;

export async function isUf2BootloaderDirectory(handle: Uf2BootloaderDirectoryHandle): Promise<boolean> {
  for (const marker of UF2_BOOTLOADER_MARKER_FILES) {
    try {
      await handle.getFileHandle(marker);
      return true;
    } catch {
      // Missing markers are expected for non-bootloader folders.
    }
  }
  return false;
}

export async function assertUf2BootloaderDirectory(handle: Uf2BootloaderDirectoryHandle): Promise<void> {
  if (await isUf2BootloaderDirectory(handle)) {
    return;
  }

  const name = handle.name ? `「${handle.name}」` : "選択したフォルダ";
  throw new Error(`${name} は UF2 bootloader volume と確認できません。bootloader mode の root folder を選び直してください`);
}
