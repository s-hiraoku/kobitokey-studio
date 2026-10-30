const MAX_CHANGES = 80;
// Bounds the LCS table; larger middles fall back to a plain replace hunk.
const MAX_LCS_CELLS = 4_000_000;

export function summarizeChangedLines(before: string, after: string): string[] {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const changes: string[] = [];

  for (const line of diffLines(beforeLines, afterLines)) {
    changes.push(line);
    if (changes.length >= MAX_CHANGES) {
      changes.push("...");
      break;
    }
  }

  return changes;
}

// Line-based LCS diff. Comparing lines by index reported every line after an
// insertion or deletion as changed, which buried the real edit.
function diffLines(beforeLines: string[], afterLines: string[]): string[] {
  let start = 0;
  while (start < beforeLines.length && start < afterLines.length && beforeLines[start] === afterLines[start]) {
    start += 1;
  }
  let beforeEnd = beforeLines.length;
  let afterEnd = afterLines.length;
  while (beforeEnd > start && afterEnd > start && beforeLines[beforeEnd - 1] === afterLines[afterEnd - 1]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  const removedMiddle = beforeLines.slice(start, beforeEnd);
  const addedMiddle = afterLines.slice(start, afterEnd);
  const rows = removedMiddle.length + 1;
  const columns = addedMiddle.length + 1;
  if (rows * columns > MAX_LCS_CELLS) {
    return [...removedMiddle.map((line) => `-${line}`), ...addedMiddle.map((line) => `+${line}`)];
  }

  const lcs = new Uint32Array(rows * columns);
  for (let row = removedMiddle.length - 1; row >= 0; row -= 1) {
    for (let column = addedMiddle.length - 1; column >= 0; column -= 1) {
      lcs[row * columns + column] =
        removedMiddle[row] === addedMiddle[column]
          ? lcs[(row + 1) * columns + column + 1] + 1
          : Math.max(lcs[(row + 1) * columns + column], lcs[row * columns + column + 1]);
    }
  }

  const changes: string[] = [];
  let removed: string[] = [];
  let added: string[] = [];
  const flush = () => {
    changes.push(...removed, ...added);
    removed = [];
    added = [];
  };
  let row = 0;
  let column = 0;
  while (row < removedMiddle.length || column < addedMiddle.length) {
    if (row < removedMiddle.length && column < addedMiddle.length && removedMiddle[row] === addedMiddle[column]) {
      flush();
      row += 1;
      column += 1;
    } else if (
      column >= addedMiddle.length ||
      (row < removedMiddle.length && lcs[(row + 1) * columns + column] >= lcs[row * columns + column + 1])
    ) {
      removed.push(`-${removedMiddle[row]}`);
      row += 1;
    } else {
      added.push(`+${addedMiddle[column]}`);
      column += 1;
    }
  }
  flush();
  return changes;
}
