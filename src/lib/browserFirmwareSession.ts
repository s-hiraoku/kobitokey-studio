import type { FirmwareBuildStatus } from "./firmwareReleaseFlow";
import { parseGitHubRepositoryRef } from "./githubFirmware";

export const BROWSER_FIRMWARE_SESSION_KEY = "kobitokey.browserFirmwareSession.v1";

export type BrowserFirmwareSession = {
  branch: string;
  buildStatus: FirmwareBuildStatus;
  commitSha: string | null;
  commitUrl: string;
  leftFlashed: boolean;
  repoUrl: string;
  rightFlashed: boolean;
  runId: number | null;
  runUrl: string;
};

type BrowserFirmwareSessionStorage = Pick<Storage, "getItem" | "setItem">;

export function readBrowserFirmwareSession(storage: BrowserFirmwareSessionStorage | null | undefined): BrowserFirmwareSession | null {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(BROWSER_FIRMWARE_SESSION_KEY);
    if (!raw) return null;
    return sanitizeBrowserFirmwareSession(JSON.parse(raw) as Partial<BrowserFirmwareSession>);
  } catch {
    return null;
  }
}

export function writeBrowserFirmwareSession(
  session: BrowserFirmwareSession,
  storage: BrowserFirmwareSessionStorage | null | undefined,
): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(BROWSER_FIRMWARE_SESSION_KEY, JSON.stringify(sanitizeBrowserFirmwareSession(session)));
  } catch {
    // Storage may be disabled; release flow still works for the current tab.
  }
}

export function sanitizeBrowserFirmwareSession(value: Partial<BrowserFirmwareSession>): BrowserFirmwareSession {
  const branch = sanitizeBranch(value.branch);
  const commitSha = sanitizeCommitSha(value.commitSha);
  const runId = commitSha && typeof value.runId === "number" && value.runId > 0 ? value.runId : null;
  const buildStatus = commitSha && runId && isFirmwareBuildStatus(value.buildStatus) ? value.buildStatus : "idle";
  const buildSucceeded = buildStatus === "success";
  const leftFlashed = buildSucceeded && Boolean(value.leftFlashed);
  const rightFlashed = leftFlashed && Boolean(value.rightFlashed);
  const repoUrl = sanitizeRepoUrl(value.repoUrl);
  const repoRef = parseGitHubRepositoryRef(repoUrl);

  return {
    branch: branch || "main",
    buildStatus,
    commitSha,
    commitUrl: commitSha && repoRef ? sanitizeGitHubCommitUrl(value.commitUrl, repoRef, commitSha) : "",
    leftFlashed,
    repoUrl,
    rightFlashed,
    runId,
    runUrl: runId && repoRef ? sanitizeGitHubRunUrl(value.runUrl, repoRef, runId) : "",
  };
}

function sanitizeBranch(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const branch = value.trim();
  if (!branch || /[\u0000-\u001f\u007f]/.test(branch)) {
    return "";
  }
  return branch.slice(0, 255);
}

function sanitizeCommitSha(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const commitSha = value.trim();
  return /^[0-9a-f]{6,64}$/i.test(commitSha) ? commitSha : null;
}

function sanitizeRepoUrl(value: unknown): string {
  if (typeof value !== "string") {
    return "https://github.com/juichi50iii/KobitoKey_QWERTY";
  }
  const repoUrl = value.trim();
  return parseGitHubRepositoryRef(repoUrl) ? repoUrl : "https://github.com/juichi50iii/KobitoKey_QWERTY";
}

function sanitizeGitHubCommitUrl(value: unknown, repoRef: { owner: string; repo: string }, commitSha: string): string {
  const url = parseHttpsGitHubUrl(value);
  if (!url) {
    return "";
  }
  return githubPathMatches(url, repoRef, ["commit", commitSha]) ? url.href : "";
}

function sanitizeGitHubRunUrl(value: unknown, repoRef: { owner: string; repo: string }, runId: number): string {
  const url = parseHttpsGitHubUrl(value);
  if (!url) {
    return "";
  }
  return githubPathMatches(url, repoRef, ["actions", "runs", String(runId)]) ? url.href : "";
}

function parseHttpsGitHubUrl(value: unknown): URL | null {
  if (typeof value !== "string") {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com" && !url.search && !url.hash ? url : null;
  } catch {
    return null;
  }
}

function githubPathMatches(url: URL, repoRef: { owner: string; repo: string }, suffix: string[]): boolean {
  const segments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  const expected = [repoRef.owner, repoRef.repo, ...suffix];
  return segments.length === expected.length && expected.every((segment, index) => segments[index] === segment);
}

function isFirmwareBuildStatus(value: unknown): value is FirmwareBuildStatus {
  return (
    value === "idle" ||
    value === "queued" ||
    value === "in_progress" ||
    value === "success" ||
    value === "failure" ||
    value === "cancelled" ||
    value === "unknown"
  );
}
