export function summarizeChangedLines(before: string, after: string): string[] {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const maxLength = Math.max(beforeLines.length, afterLines.length);
  const changes: string[] = [];

  for (let index = 0; index < maxLength; index += 1) {
    if (beforeLines[index] !== afterLines[index]) {
      changes.push(`-${beforeLines[index] ?? ""}`);
      changes.push(`+${afterLines[index] ?? ""}`);
    }
    if (changes.length >= 80) {
      changes.push("...");
      break;
    }
  }

  return changes;
}
