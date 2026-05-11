export type PhysicalKey = {
  index: number;
  x: number;
  y: number;
  rotation: number;
  width: number;
  height: number;
  side: "left" | "right";
  kind: "matrix" | "outer" | "thumb";
};

export type TrackballPosition = {
  side: "left" | "right";
  x: number;
  y: number;
  rotation: number;
};

export const KEY_UNIT = 56;
export const LEFT_HALF_WIDTH = 700;
export const RIGHT_HALF_X = 536;
export const LAYOUT_WIDTH = RIGHT_HALF_X + LEFT_HALF_WIDTH;
export const LAYOUT_HEIGHT = 540;
const TRACKBALL_SIZE = 112;

const leftKeys: PhysicalKey[] = [
  key(0, 118, 64, 0, "matrix"),
  key(1, 190, 40, 0, "matrix"),
  key(2, 262, 30, 0, "matrix"),
  key(3, 334, 40, 0, "matrix"),
  key(4, 406, 68, 0, "matrix"),

  key(10, 118, 136, 0, "matrix"),
  key(11, 190, 112, 0, "matrix"),
  key(12, 262, 102, 0, "matrix"),
  key(13, 334, 112, 0, "matrix"),
  key(14, 406, 140, 0, "matrix"),

  key(20, 118, 208, 0, "matrix"),
  key(21, 190, 184, 0, "matrix"),
  key(22, 262, 174, 0, "matrix"),
  key(23, 334, 184, 0, "matrix"),
  key(24, 406, 212, 0, "matrix"),

  key(30, 118, 280, 0, "outer"),
  key(31, 190, 256, 0, "outer"),
  key(32, 360, 312, 7, "thumb"),
  key(33, 432, 326, 14, "thumb"),
  key(34, 504, 350, 22, "thumb"),
];

export const kobitoKeyPhysicalLayout: PhysicalKey[] = [
  ...leftKeys,
  ...leftKeys.map(mirrorKey),
].sort((a, b) => a.index - b.index);

export const matrixBasePath = traceRectUnion(
  leftKeys.filter((key) => key.kind === "matrix" || key.kind === "outer"),
  12,
);

const thumbBase = traceThumbFan(
  leftKeys.filter((key) => key.kind === "thumb"),
  9,
);
const trackballBase = makeTrackballBase(thumbBase.rightUpper);

export const trackballBasePath = rectPath(trackballBase);
export const thumbBasePath = thumbBase.path;
export const rightMirrorTransform = `translate(${RIGHT_HALF_X + LEFT_HALF_WIDTH} 0) scale(-1 1)`;

const leftTrackball: TrackballPosition = {
  side: "left",
  x: trackballBase.x + (trackballBase.width - TRACKBALL_SIZE) / 2,
  y: requiredLeftKey(24).y + requiredLeftKey(24).height - TRACKBALL_SIZE / 2,
  rotation: 0,
};

export const trackballs: TrackballPosition[] = [leftTrackball, mirrorTrackball(leftTrackball)];

function key(
  index: number,
  x: number,
  y: number,
  rotation: number,
  kind: PhysicalKey["kind"],
): PhysicalKey {
  return {
    index,
    x,
    y,
    rotation,
    width: KEY_UNIT,
    height: KEY_UNIT,
    side: "left",
    kind,
  };
}

function mirrorKey(key: PhysicalKey): PhysicalKey {
  return {
    ...key,
    index: mirrorIndex(key.index),
    side: "right",
    x: RIGHT_HALF_X + LEFT_HALF_WIDTH - key.x - key.width,
    rotation: -key.rotation,
  };
}

function traceRectUnion(keys: PhysicalKey[], padding: number): string {
  const rects = keys.map((key) => ({
    x1: key.x - padding,
    y1: key.y - padding,
    x2: key.x + key.width + padding,
    y2: key.y + key.height + padding,
  }));
  const xs = uniqueSorted(rects.flatMap((rect) => [rect.x1, rect.x2]));
  const ys = uniqueSorted(rects.flatMap((rect) => [rect.y1, rect.y2]));
  const occupied = Array.from({ length: ys.length - 1 }, () =>
    Array.from({ length: xs.length - 1 }, () => false),
  );

  rects.forEach((rect) => {
    for (let y = 0; y < ys.length - 1; y += 1) {
      for (let x = 0; x < xs.length - 1; x += 1) {
        if (xs[x] >= rect.x1 && xs[x + 1] <= rect.x2 && ys[y] >= rect.y1 && ys[y + 1] <= rect.y2) {
          occupied[y][x] = true;
        }
      }
    }
  });

  const edges: Array<[Point, Point]> = [];
  for (let y = 0; y < occupied.length; y += 1) {
    for (let x = 0; x < occupied[y].length; x += 1) {
      if (!occupied[y][x]) {
        continue;
      }
      const x1 = xs[x];
      const x2 = xs[x + 1];
      const y1 = ys[y];
      const y2 = ys[y + 1];

      if (!occupied[y - 1]?.[x]) edges.push([point(x1, y1), point(x2, y1)]);
      if (!occupied[y]?.[x + 1]) edges.push([point(x2, y1), point(x2, y2)]);
      if (!occupied[y + 1]?.[x]) edges.push([point(x2, y2), point(x1, y2)]);
      if (!occupied[y]?.[x - 1]) edges.push([point(x1, y2), point(x1, y1)]);
    }
  }

  return longestClosedPath(edges);
}

type Point = `${number},${number}`;

function longestClosedPath(edges: Array<[Point, Point]>): string {
  const unused = [...edges];
  const paths: Point[][] = [];

  while (unused.length > 0) {
    const [start, next] = unused.shift()!;
    const path = [start, next];

    while (path[path.length - 1] !== start) {
      const last = path[path.length - 1];
      const nextIndex = unused.findIndex(([edgeStart]) => edgeStart === last);
      if (nextIndex < 0) {
        break;
      }
      const [, edgeEnd] = unused.splice(nextIndex, 1)[0];
      path.push(edgeEnd);
    }

    paths.push(path);
  }

  const longest = paths.sort((a, b) => b.length - a.length)[0] ?? [];
  return longest
    .map((pointValue, index) => `${index === 0 ? "M" : "L"} ${pointValue.replace(",", " ")}`)
    .join(" ")
    .concat(" Z");
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function point(x: number, y: number): Point {
  return `${x},${y}`;
}

function makeTrackballBase(attachmentPoint: { x: number; y: number }) {
  const displayKey5 = requiredLeftKey(4);
  const y = displayKey5.y + displayKey5.height;
  const width = 112;
  const x = attachmentPoint.x - width;
  const height = attachmentPoint.y - y;

  return { x, y, width, height };
}

function rectPath(rect: { x: number; y: number; width: number; height: number }) {
  return [
    `M ${rect.x} ${rect.y}`,
    `H ${rect.x + rect.width}`,
    `V ${rect.y + rect.height}`,
    `H ${rect.x}`,
    "Z",
  ].join(" ");
}

function requiredKey(index: number) {
  const key = kobitoKeyPhysicalLayout.find((candidate) => candidate.index === index);
  if (!key) {
    throw new Error(`Missing physical key ${index}`);
  }
  return key;
}

function requiredLeftKey(index: number) {
  const key = leftKeys.find((candidate) => candidate.index === index);
  if (!key) {
    throw new Error(`Missing left physical key ${index}`);
  }
  return key;
}

function mirrorTrackball(trackball: TrackballPosition): TrackballPosition {
  return {
    side: "right",
    x: RIGHT_HALF_X + LEFT_HALF_WIDTH - trackball.x - TRACKBALL_SIZE,
    y: trackball.y,
    rotation: -trackball.rotation,
  };
}

function mirrorIndex(index: number): number {
  if (index < 5) {
    return 9 - index;
  }
  if (index >= 10 && index < 15) {
    return 29 - index;
  }
  if (index >= 20 && index < 25) {
    return 49 - index;
  }
  return 69 - index;
}

function traceThumbFan(
  keys: PhysicalKey[],
  padding: number,
): { path: string; minX: number; rightUpper: { x: number; y: number } } {
  const sortedKeys = [...keys].sort((a, b) => a.index - b.index);
  const centers = sortedKeys.map((key) => ({
    x: key.x + key.width / 2,
    y: key.y + key.height / 2,
  }));
  const center = circleCenter(centers[0], centers[1], centers[2]);
  const corners = sortedKeys.flatMap((key) => rotatedCorners(key, padding));
  const angles = corners.map((corner) => Math.atan2(corner.y - center.y, corner.x - center.x));
  const radii = corners.map((corner) => Math.hypot(corner.x - center.x, corner.y - center.y));
  const startAngle = Math.min(...angles) - 0.012;
  const endAngle = Math.max(...angles) + 0.012;
  const innerRadius = Math.max(0, Math.min(...radii) - padding * 0.2);
  const outerRadius = Math.max(...radii) + padding * 0.35;
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const outerStart = polar(center, outerRadius, startAngle);
  const outerEnd = polar(center, outerRadius, endAngle);
  const innerEnd = polar(center, innerRadius, endAngle);
  const innerStart = polar(center, innerRadius, startAngle);

  const points = [outerStart, outerEnd, innerEnd, innerStart];
  const path = [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");

  return {
    path,
    minX: Math.min(...points.map((point) => point.x)),
    rightUpper: outerEnd,
  };
}

function rotatedCorners(key: PhysicalKey, padding: number) {
  const centerX = key.x + key.width / 2;
  const centerY = key.y + key.height / 2;
  const angle = (key.rotation * Math.PI) / 180;
  return [
    [-padding, -padding],
    [key.width + padding, -padding],
    [key.width + padding, key.height + padding],
    [-padding, key.height + padding],
  ].map(([x, y]) => {
    const dx = x - key.width / 2;
    const dy = y - key.height / 2;
    return {
      x: centerX + dx * Math.cos(angle) - dy * Math.sin(angle),
      y: centerY + dx * Math.sin(angle) + dy * Math.cos(angle),
    };
  });
}

function circleCenter(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
) {
  const determinant =
    2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(determinant) < 0.001) {
    return { x: a.x - 220, y: a.y + 520 };
  }

  return {
    x:
      ((a.x * a.x + a.y * a.y) * (b.y - c.y) +
        (b.x * b.x + b.y * b.y) * (c.y - a.y) +
        (c.x * c.x + c.y * c.y) * (a.y - b.y)) /
      determinant,
    y:
      ((a.x * a.x + a.y * a.y) * (c.x - b.x) +
        (b.x * b.x + b.y * b.y) * (a.x - c.x) +
        (c.x * c.x + c.y * c.y) * (b.x - a.x)) /
      determinant,
  };
}

function polar(center: { x: number; y: number }, radius: number, angle: number) {
  return {
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle),
  };
}
