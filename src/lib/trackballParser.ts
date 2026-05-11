export type TrackballSettings = {
  leftCpi?: number;
  rightCpi?: number;
  pointerMinFactor?: number;
  pointerMaxFactor?: number;
  pointerSpeedThreshold?: number;
  pointerAccelerationExponent?: number;
  rightPointerMinFactor?: number;
  rightPointerMaxFactor?: number;
  rightPointerSpeedThreshold?: number;
  rightPointerAccelerationExponent?: number;
  gestureThreshold?: number;
  tabThreshold?: number;
  desktopThreshold?: number;
};

export function parseTrackballSettings(leftOverlay: string, rightOverlay: string): TrackballSettings {
  return {
    leftCpi: readFirstNumber(leftOverlay, /tb_left:[\s\S]*?cpi\s*=\s*<(\d+)>/),
    rightCpi: readFirstNumber(rightOverlay, /tb_right:[\s\S]*?cpi\s*=\s*<(\d+)>/),
    pointerMinFactor: readBlockNumber(leftOverlay, "pointer_accel", "min-factor"),
    pointerMaxFactor: readBlockNumber(leftOverlay, "pointer_accel", "max-factor"),
    pointerSpeedThreshold: readBlockNumber(leftOverlay, "pointer_accel", "speed-threshold"),
    pointerAccelerationExponent: readBlockNumber(leftOverlay, "pointer_accel", "acceleration-exponent"),
    rightPointerMinFactor: readBlockNumber(leftOverlay, "pointer_accel_right", "min-factor"),
    rightPointerMaxFactor: readBlockNumber(leftOverlay, "pointer_accel_right", "max-factor"),
    rightPointerSpeedThreshold: readBlockNumber(leftOverlay, "pointer_accel_right", "speed-threshold"),
    rightPointerAccelerationExponent: readBlockNumber(leftOverlay, "pointer_accel_right", "acceleration-exponent"),
    gestureThreshold: readBlockNumber(leftOverlay, "gesture_keybind", "threshold"),
    tabThreshold: readBlockNumber(leftOverlay, "tab_keybind", "threshold"),
    desktopThreshold: readBlockNumber(leftOverlay, "desktop_keybind", "threshold"),
  };
}

export function updateNumberSetting(source: string, propertyName: string, value: number): string {
  const pattern = new RegExp(`(${escapeRegExp(propertyName)}\\s*=\\s*<)\\d+(>)`);
  return source.replace(pattern, `$1${value}$2`);
}

export function updateBlockNumberSetting(
  source: string,
  blockName: string,
  propertyName: string,
  value: number,
): string {
  const blockStart = source.indexOf(blockName);
  if (blockStart < 0) {
    return source;
  }

  const blockEnd = source.indexOf("};", blockStart);
  if (blockEnd < 0) {
    return source;
  }

  const block = source.slice(blockStart, blockEnd);
  const updatedBlock = updateNumberSetting(block, propertyName, value);
  return source.slice(0, blockStart) + updatedBlock + source.slice(blockEnd);
}

function readBlockNumber(source: string, blockName: string, propertyName: string): number | undefined {
  const blockStart = source.indexOf(blockName);
  if (blockStart < 0) {
    return undefined;
  }

  const block = source.slice(blockStart, source.indexOf("};", blockStart) + 2);
  return readFirstNumber(block, new RegExp(`${escapeRegExp(propertyName)}\\s*=\\s*<(\\d+)>`));
}

function readFirstNumber(source: string, pattern: RegExp): number | undefined {
  const value = source.match(pattern)?.[1];
  return value === undefined ? undefined : Number(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
