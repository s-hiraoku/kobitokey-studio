export type TrackballSettings = {
  leftCpi?: number;
  rightCpi?: number;
  pointerScaleMultiplier?: number;
  pointerSpeedThreshold?: number;
  pointerAccelerationExponent?: number;
  rightPointerScaleMultiplier?: number;
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
    pointerScaleMultiplier: readBlockNumber(leftOverlay, "pointer_accel", "scale-multiplier"),
    pointerSpeedThreshold: readBlockNumber(leftOverlay, "pointer_accel", "speed-threshold"),
    pointerAccelerationExponent: readBlockNumber(leftOverlay, "pointer_accel", "acceleration-exponent"),
    rightPointerScaleMultiplier: readBlockNumber(leftOverlay, "pointer_accel_right", "scale-multiplier"),
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
