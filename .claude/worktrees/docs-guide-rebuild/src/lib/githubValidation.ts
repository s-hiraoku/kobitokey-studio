export function isGitHubPathSegment(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value) && !value.startsWith(".") && !value.endsWith(".");
}
