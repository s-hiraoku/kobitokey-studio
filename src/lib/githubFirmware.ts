import type { ProjectFiles } from "./projectFiles";
import { isGitHubPathSegment } from "./githubValidation";

export type GitHubRepositoryRef = {
  owner: string;
  repo: string;
};

export type GitHubFirmwarePathKey = "keymap" | "leftOverlay" | "rightOverlay";

export type GitHubFirmwareFileChange = {
  path: string;
  contents: string;
};

export type GitHubFirmwareCommitPlan = {
  branch: string;
  message: string;
  files: GitHubFirmwareFileChange[];
};

export const GITHUB_FIRMWARE_PATHS: Record<GitHubFirmwarePathKey, string> = {
  keymap: "config/KobitoKey.keymap",
  leftOverlay: "config/boards/shields/KobitoKey/KobitoKey_left.overlay",
  rightOverlay: "config/boards/shields/KobitoKey/KobitoKey_right.overlay",
};

export function parseGitHubRepositoryRef(value: string): GitHubRepositoryRef | null {
  const trimmed = value.trim().replace(/\/$/, "").replace(/\.git$/, "");
  const withoutProtocol = trimmed
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/^git@github\.com:/, "");
  const [owner, repo, ...rest] = withoutProtocol.split("/").filter(Boolean);

  if (!owner || !repo || rest.length > 0 || !isGitHubPathSegment(owner) || !isGitHubPathSegment(repo)) {
    return null;
  }
  return { owner, repo };
}

export function formatGitHubRepositoryRef(ref: GitHubRepositoryRef): string {
  return `${ref.owner}/${ref.repo}`;
}

export function buildGitHubFirmwareCommitPlan({
  branch,
  files,
  message,
}: {
  branch: string;
  files: ProjectFiles;
  message?: string;
}): GitHubFirmwareCommitPlan {
  const targetBranch = branch.trim();
  if (!targetBranch) {
    throw new Error("GitHub branch is required");
  }

  return {
    branch: targetBranch,
    message: message?.trim() || "Update KobitoKey firmware settings",
    files: [
      { path: GITHUB_FIRMWARE_PATHS.keymap, contents: files.keymap },
      { path: GITHUB_FIRMWARE_PATHS.leftOverlay, contents: files.leftOverlay },
      { path: GITHUB_FIRMWARE_PATHS.rightOverlay, contents: files.rightOverlay },
    ],
  };
}

export function githubContentsUrl(ref: GitHubRepositoryRef, path: string, branch: string): string {
  const params = new URLSearchParams({ ref: branch });
  return `https://api.github.com/repos/${githubRepoApiPath(ref)}/contents/${encodeGitHubPath(path)}?${params}`;
}

export function githubWorkflowDispatchUrl(ref: GitHubRepositoryRef, workflowFile = "build.yml"): string {
  return `https://api.github.com/repos/${githubRepoApiPath(ref)}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`;
}

export function githubWorkflowRunsUrl(ref: GitHubRepositoryRef, workflowFile = "build.yml", branch?: string): string {
  const params = new URLSearchParams({
    per_page: "20",
  });
  if (branch?.trim()) {
    params.set("branch", branch.trim());
  }
  return `https://api.github.com/repos/${githubRepoApiPath(ref)}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?${params}`;
}

export function githubGitRefUrl(ref: GitHubRepositoryRef, branch: string): string {
  const branchRef = encodeGitHubPath(branch.trim());
  if (!branchRef) {
    throw new Error("GitHub branch is required");
  }
  return `https://api.github.com/repos/${githubRepoApiPath(ref)}/git/ref/heads/${branchRef}`;
}

export function githubGitRefsUrl(ref: GitHubRepositoryRef, branch: string): string {
  const branchRef = encodeGitHubPath(branch.trim());
  if (!branchRef) {
    throw new Error("GitHub branch is required");
  }
  return `https://api.github.com/repos/${githubRepoApiPath(ref)}/git/refs/heads/${branchRef}`;
}

function githubRepoApiPath(ref: GitHubRepositoryRef): string {
  return `${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
}

function encodeGitHubPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
