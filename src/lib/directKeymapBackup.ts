import { sameDirectBinding, type StudioKeymap } from "./directKeymap";

const BACKUP_FORMAT = "kobitokey-direct-keymap";
const BACKUP_VERSION = 1;

export type DirectKeymapBackup = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  deviceName: string;
  layers: Array<{ name: string; bindings: string[] }>;
};

export type DirectKeymapRestorePlan = {
  keyWrites: Array<{ layerIndex: number; layerId: number; keyPosition: number; binding: string }>;
  renames: Array<{ layerIndex: number; layerId: number; name: string }>;
  /** Layers in the backup that the device has no slot for. */
  missingLayerCount: number;
  /** Layers on the device that the backup does not mention; they are left as they are. */
  extraLayerCount: number;
};

export function createDirectKeymapBackup(keymap: StudioKeymap, exportedAt: Date = new Date()): DirectKeymapBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    deviceName: keymap.deviceName,
    layers: keymap.layers.map((layer) => ({ name: layer.name, bindings: [...layer.bindings] })),
  };
}

export function directKeymapBackupFileName(backup: DirectKeymapBackup): string {
  const stamp = backup.exportedAt.replace(/\.\d+Z$/, "").replace(/[:T]/g, "-");
  return `kobitokey-direct-${stamp}.json`;
}

export function parseDirectKeymapBackup(text: string): DirectKeymapBackup {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("バックアップファイルが JSON として読めません");
  }
  if (!isRecord(value) || value.format !== BACKUP_FORMAT) {
    throw new Error("KobitoKey Studio の Direct バックアップではありません");
  }
  if (value.version !== BACKUP_VERSION) {
    throw new Error(`未対応のバックアップ形式です (version ${String(value.version)})`);
  }
  if (!Array.isArray(value.layers) || value.layers.length === 0) {
    throw new Error("バックアップに layer がありません");
  }
  const layers = value.layers.map((layer, index) => {
    if (!isRecord(layer) || typeof layer.name !== "string" || !Array.isArray(layer.bindings)) {
      throw new Error(`Layer ${index} の形式が正しくありません`);
    }
    if (!layer.bindings.every((binding) => typeof binding === "string" && binding.trim().startsWith("&"))) {
      throw new Error(`Layer ${index} に読めない binding があります`);
    }
    return { name: layer.name, bindings: layer.bindings as string[] };
  });
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : "",
    deviceName: typeof value.deviceName === "string" ? value.deviceName : "",
    layers,
  };
}

/** Work out the smallest set of writes that brings the device back to the backup. */
export function planDirectKeymapRestore(backup: DirectKeymapBackup, current: StudioKeymap): DirectKeymapRestorePlan {
  const keyWrites: DirectKeymapRestorePlan["keyWrites"] = [];
  const renames: DirectKeymapRestorePlan["renames"] = [];
  const sharedLayerCount = Math.min(backup.layers.length, current.layers.length);

  for (let layerIndex = 0; layerIndex < sharedLayerCount; layerIndex += 1) {
    const saved = backup.layers[layerIndex];
    const device = current.layers[layerIndex];
    if (saved.name && saved.name !== device.name) {
      renames.push({ layerIndex, layerId: device.id, name: saved.name });
    }
    saved.bindings.forEach((binding, keyPosition) => {
      const deviceBinding = device.bindings[keyPosition];
      if (deviceBinding === undefined || !sameDirectBinding(binding, deviceBinding)) {
        keyWrites.push({ layerIndex, layerId: device.id, keyPosition, binding });
      }
    });
  }

  return {
    keyWrites,
    renames,
    missingLayerCount: Math.max(0, backup.layers.length - current.layers.length),
    extraLayerCount: Math.max(0, current.layers.length - backup.layers.length),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
