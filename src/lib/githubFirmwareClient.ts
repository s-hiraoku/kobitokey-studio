import type { ProjectFiles } from "./projectFiles";
import { unzipSync } from "fflate";
import { classifyUf2Artifacts, type ClassifiedUf2Artifacts } from "./firmwareReleaseFlow";
import {
  GITHUB_FIRMWARE_PATHS,
  buildGitHubFirmwareCommitPlan,
  githubContentsUrl,
  githubGitRefUrl,
  githubGitRefsUrl,
  githubWorkflowDispatchUrl,
  githubWorkflowRunsUrl,
  type GitHubFirmwareCommitPlan,
  type GitHubRepositoryRef,
} from "./githubFirmware";

export type GitHubApiClientOptions = {
  fetchImpl?: typeof fetch;
  token: string;
};

export type GitHubCommitResult = {
  commitSha: string;
  htmlUrl: string;
};

export type GitHubFirmwareProjectSnapshot = {
  files: ProjectFiles;
  headSha: string;
};

export type GitHubWorkflowRun = {
  id: number;
  htmlUrl: string;
  headSha: string;
  headBranch: string;
  status: string;
  conclusion: string | null;
};

export type GitHubArtifactUf2 = {
  name: string;
  bytes: Uint8Array;
};

export type GitHubArtifactManifest = {
  name: string;
  contents: string;
};

export type GitHubFirmwareArtifacts = {
  files: GitHubArtifactUf2[];
  manifestPath?: string;
  targets: ClassifiedUf2Artifacts;
};

type GitHubContentResponse = {
  content: string;
  encoding: string;
};

type GitHubRefResponse = {
  object: {
    sha: string;
  };
};

type GitHubCommitResponse = {
  sha: string;
  html_url?: string;
  tree: {
    sha: string;
  };
};

type GitHubTreeResponse = {
  sha: string;
};

type GitHubWorkflowRunsResponse = {
  workflow_runs: Array<{
    id: number;
    html_url: string;
    head_sha: string;
    head_branch?: string | null;
    status: string;
    conclusion: string | null;
  }>;
};

type GitHubWorkflowRunResponse = {
  id: number;
  html_url: string;
  head_sha: string;
  head_branch?: string | null;
  status: string;
  conclusion: string | null;
};

type GitHubArtifactsResponse = {
  artifacts: Array<{
    id: number;
    name: string;
    expired: boolean;
    size_in_bytes?: number;
  }>;
};

export async function readGitHubFirmwareProject(
  ref: GitHubRepositoryRef,
  branch: string,
  options: GitHubApiClientOptions,
): Promise<ProjectFiles> {
  const [keymap, leftOverlay, rightOverlay] = await Promise.all([
    readGitHubTextFile(ref, GITHUB_FIRMWARE_PATHS.keymap, branch, options),
    readGitHubTextFile(ref, GITHUB_FIRMWARE_PATHS.leftOverlay, branch, options),
    readGitHubTextFile(ref, GITHUB_FIRMWARE_PATHS.rightOverlay, branch, options),
  ]);

  return { keymap, leftOverlay, rightOverlay };
}

export async function readGitHubFirmwareProjectSnapshot(
  ref: GitHubRepositoryRef,
  branch: string,
  options: GitHubApiClientOptions,
): Promise<GitHubFirmwareProjectSnapshot> {
  const headSha = await getGitHubBranchHeadSha(ref, branch, options);
  const files = await readGitHubFirmwareProject(ref, headSha, options);
  return { files, headSha };
}

export async function getGitHubBranchHeadSha(
  ref: GitHubRepositoryRef,
  branch: string,
  options: GitHubApiClientOptions,
): Promise<string> {
  const fetcher = githubFetcher(options);
  const response = await fetcher<GitHubRefResponse>(githubGitRefUrl(ref, branch));
  return response.object.sha;
}

export async function createGitHubFirmwareCommit(
  ref: GitHubRepositoryRef,
  plan: GitHubFirmwareCommitPlan,
  options: GitHubApiClientOptions,
  constraints: { expectedHeadSha?: string } = {},
): Promise<GitHubCommitResult> {
  const fetcher = githubFetcher(options);
  const refResponse = await fetcher<GitHubRefResponse>(githubGitRefUrl(ref, plan.branch));
  const headSha = refResponse.object.sha;
  if (constraints.expectedHeadSha && headSha !== constraints.expectedHeadSha) {
    throw new Error("GitHub branch が読み込み後に更新されています。GitHub から読み込み直してから再実行してください");
  }
  const headCommit = await fetcher<GitHubCommitResponse>(`https://api.github.com/repos/${repoPath(ref)}/git/commits/${headSha}`);
  const nextTree = await fetcher<GitHubTreeResponse>(`https://api.github.com/repos/${repoPath(ref)}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: headCommit.tree.sha,
      tree: plan.files.map((file) => ({
        path: file.path,
        mode: "100644",
        type: "blob",
        content: file.contents,
      })),
    }),
  });
  const nextCommit = await fetcher<GitHubCommitResponse>(`https://api.github.com/repos/${repoPath(ref)}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: plan.message,
      tree: nextTree.sha,
      parents: [headSha],
    }),
  });
  await fetcher(githubGitRefsUrl(ref, plan.branch), {
    method: "PATCH",
    body: JSON.stringify({ sha: nextCommit.sha }),
  });

  return {
    commitSha: nextCommit.sha,
    htmlUrl: nextCommit.html_url ?? `https://github.com/${repoPath(ref)}/commit/${nextCommit.sha}`,
  };
}

export async function commitGitHubFirmwareFiles({
  branch,
  files,
  message,
  options,
  ref,
  expectedHeadSha,
}: {
  branch: string;
  expectedHeadSha?: string;
  files: ProjectFiles;
  message?: string;
  options: GitHubApiClientOptions;
  ref: GitHubRepositoryRef;
}): Promise<GitHubCommitResult> {
  return createGitHubFirmwareCommit(ref, buildGitHubFirmwareCommitPlan({ branch, files, message }), options, {
    expectedHeadSha,
  });
}

export async function dispatchGitHubFirmwareBuild(
  ref: GitHubRepositoryRef,
  branch: string,
  options: GitHubApiClientOptions,
  workflowFile = "build.yml",
): Promise<void> {
  const fetcher = githubFetcher(options);
  await fetcher(githubWorkflowDispatchUrl(ref, workflowFile), {
    method: "POST",
    body: JSON.stringify({ ref: branch }),
    expectJson: false,
  });
}

export async function findGitHubFirmwareBuildRun(
  ref: GitHubRepositoryRef,
  branch: string,
  commitSha: string,
  options: GitHubApiClientOptions,
  workflowFile = "build.yml",
): Promise<GitHubWorkflowRun | null> {
  const fetcher = githubFetcher(options);
  const result = await fetcher<GitHubWorkflowRunsResponse>(githubWorkflowRunsUrl(ref, workflowFile, branch));
  const run = result.workflow_runs.find((candidate) => candidate.head_sha === commitSha && candidate.head_branch === branch);
  if (!run) {
    return null;
  }
  return githubWorkflowRunFromResponse(run);
}

export async function getGitHubFirmwareBuildRun(
  ref: GitHubRepositoryRef,
  runId: number,
  options: GitHubApiClientOptions,
): Promise<GitHubWorkflowRun> {
  const fetcher = githubFetcher(options);
  const run = await fetcher<GitHubWorkflowRunResponse>(
    `https://api.github.com/repos/${repoPath(ref)}/actions/runs/${runId}`,
  );
  return githubWorkflowRunFromResponse(run);
}

export async function downloadGitHubFirmwareArtifacts(
  ref: GitHubRepositoryRef,
  runId: number,
  options: GitHubApiClientOptions,
  constraints: { expectedHeadSha?: string; expectedHeadBranch?: string; requireSuccess?: boolean } = {},
): Promise<GitHubFirmwareArtifacts> {
  const fetcher = githubFetcher(options);
  if (constraints.expectedHeadSha || constraints.expectedHeadBranch || constraints.requireSuccess) {
    const run = await getGitHubFirmwareBuildRun(ref, runId, options);
    if (constraints.expectedHeadSha && run.headSha !== constraints.expectedHeadSha) {
      throw new Error(`GitHub Actions run ${runId} does not match commit ${constraints.expectedHeadSha}`);
    }
    if (constraints.expectedHeadBranch && run.headBranch !== constraints.expectedHeadBranch) {
      throw new Error(`GitHub Actions run ${runId} does not match branch ${constraints.expectedHeadBranch}`);
    }
    if (constraints.requireSuccess && (run.status !== "completed" || run.conclusion !== "success")) {
      throw new Error(`GitHub Actions run ${runId} is not successful: ${run.status} / ${run.conclusion ?? "pending"}`);
    }
  }
  const artifactsResponse = await fetcher<GitHubArtifactsResponse>(
    `https://api.github.com/repos/${repoPath(ref)}/actions/runs/${runId}/artifacts`,
  );
  if (artifactsResponse.artifacts.length === 0) {
    throw new Error(`GitHub Actions run ${runId} に artifact が見つかりません。build.yml の artifact upload を確認してください`);
  }
  const activeArtifacts = artifactsResponse.artifacts.filter((artifact) => !artifact.expired);
  if (activeArtifacts.length === 0) {
    throw new Error(`GitHub Actions run ${runId} の artifact は期限切れです。Build 起動で新しい artifact を作成してください`);
  }
  const files: GitHubArtifactUf2[] = [];
  const manifests: GitHubArtifactManifest[] = [];
  const entriesByArtifact: Array<{ files: GitHubArtifactUf2[]; manifests: GitHubArtifactManifest[] }> = [];

  for (const artifact of activeArtifacts) {
    const zipBytes = await fetchGitHubArtifactZip(ref, artifact.id, options);
    const entries = extractFirmwareArtifactEntriesFromZip(zipBytes);
    entriesByArtifact.push(entries);
    files.push(...entries.files);
    manifests.push(...entries.manifests);
  }
  if (files.length === 0) {
    throw new Error(`GitHub Actions run ${runId} の artifact に UF2 が含まれていません。firmware build の出力を確認してください`);
  }
  const manifestClassification = classifyArtifactEntries(entriesByArtifact);

  return {
    files,
    manifestPath: manifestClassification.manifestPath,
    targets: manifestClassification.targets,
  };
}

export async function readGitHubTextFile(
  ref: GitHubRepositoryRef,
  path: string,
  branch: string,
  options: GitHubApiClientOptions,
): Promise<string> {
  const fetcher = githubFetcher(options);
  const response = await fetcher<GitHubContentResponse>(githubContentsUrl(ref, path, branch));
  if (response.encoding !== "base64") {
    throw new Error(`Unsupported GitHub content encoding: ${response.encoding}`);
  }
  return decodeBase64Text(response.content);
}

function githubFetcher({ fetchImpl = fetch, token }: GitHubApiClientOptions) {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    throw new Error("GitHub token is required");
  }

  return async function request<T = unknown>(
    url: string,
    options: RequestInit & { expectJson?: boolean } = {},
  ): Promise<T> {
    const response = await fetchImpl(url, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${trimmedToken}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(formatGitHubHttpFailure("GitHub API", response.status, body, response.statusText));
    }

    if (options.expectJson === false || response.status === 204) {
      return undefined as T;
    }
    return response.json() as Promise<T>;
  };
}

function githubWorkflowRunFromResponse(run: GitHubWorkflowRunResponse): GitHubWorkflowRun {
  return {
    id: run.id,
    htmlUrl: run.html_url,
    headSha: run.head_sha,
    headBranch: run.head_branch ?? "",
    status: run.status,
    conclusion: run.conclusion,
  };
}

function formatGitHubHttpFailure(prefix: string, status: number, body: string, statusText: string): string {
  const detail = extractGitHubErrorDetail(body) || statusText;
  return `${prefix} ${status}: ${detail}。次の操作: ${gitHubFailureNextAction(status, detail)}`;
}

function extractGitHubErrorDetail(body: string): string {
  if (!body.trim()) {
    return "";
  }
  try {
    const json: unknown = JSON.parse(body);
    if (isRecord(json) && typeof json.message === "string") {
      return json.message;
    }
  } catch {
    // Fall back to the raw response body.
  }
  return body;
}

function gitHubFailureNextAction(status: number, detail: string): string {
  const normalized = detail.toLowerCase();
  if (status === 401) {
    return "GitHub で再接続するか、repository 書き込みと Actions 実行権限のある token を入力してください";
  }
  if (status === 403 && normalized.includes("rate limit")) {
    return "しばらく待ってから再試行するか、認証済み token で接続し直してください";
  }
  if (status === 403) {
    return "token/OAuth の repository 書き込み権限と Actions 実行権限を確認してください";
  }
  if (status === 404) {
    return "repository、branch、managed firmware file path、または private repository へのアクセス権を確認してください";
  }
  if (status === 409) {
    return "branch が更新されている可能性があります。GitHub から読み込み直してから再実行してください";
  }
  if (status === 422) {
    return "branch 名、build.yml workflow、commit 内容、または workflow dispatch の有効状態を確認してください";
  }
  return "GitHub 側の詳細を確認し、必要なら再接続してから再試行してください";
}

async function fetchGitHubArtifactZip(
  ref: GitHubRepositoryRef,
  artifactId: number,
  { fetchImpl = fetch, token }: GitHubApiClientOptions,
): Promise<Uint8Array> {
  const response = await fetchImpl("/api/github/artifact-zip", {
    method: "POST",
    headers: {
      Accept: "application/zip",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      artifactId,
      owner: ref.owner,
      repo: ref.repo,
      token: token.trim(),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(formatGitHubHttpFailure("GitHub artifact download", response.status, body, response.statusText));
  }
  return new Uint8Array(await response.arrayBuffer());
}

export function extractUf2FilesFromZip(zipBytes: Uint8Array): GitHubArtifactUf2[] {
  return extractFirmwareArtifactEntriesFromZip(zipBytes).files;
}

export function extractFirmwareArtifactEntriesFromZip(zipBytes: Uint8Array): {
  files: GitHubArtifactUf2[];
  manifests: GitHubArtifactManifest[];
} {
  const entries = unzipSync(zipBytes);
  const files: GitHubArtifactUf2[] = [];
  const manifests: GitHubArtifactManifest[] = [];

  for (const [name, bytes] of Object.entries(entries)) {
    const filename = basename(name).toLowerCase();
    if (filename.endsWith(".uf2")) {
      files.push({ name, bytes });
    } else if (filename === "manifest.json" || filename === "firmware-manifest.json") {
      manifests.push({ name, contents: new TextDecoder().decode(bytes) });
    }
  }

  return { files, manifests };
}

export function classifyUf2ArtifactsFromManifests(
  uf2Files: string[],
  manifests: GitHubArtifactManifest[],
): { manifestPath?: string; targets: ClassifiedUf2Artifacts } {
  const byName = classifyUf2Artifacts(uf2Files);

  for (const manifest of [...manifests].sort((left, right) => left.name.localeCompare(right.name))) {
    const targets = targetsFromManifest(manifest, uf2Files);
    if (targets && (targets.left || targets.right)) {
      return {
        manifestPath: manifest.name,
        targets: mergeManifestTargets(targets, byName, uf2Files),
      };
    }
  }

  return { targets: byName };
}

function classifyArtifactEntries(
  artifacts: Array<{ files: GitHubArtifactUf2[]; manifests: GitHubArtifactManifest[] }>,
): { manifestPath?: string; targets: ClassifiedUf2Artifacts } {
  const allFiles = artifacts.flatMap((artifact) => artifact.files.map((file) => file.name));
  for (const artifact of artifacts) {
    const classification = classifyUf2ArtifactsFromManifests(
      artifact.files.map((file) => file.name),
      artifact.manifests,
    );
    if (classification.manifestPath) {
      return {
        manifestPath: classification.manifestPath,
        targets: {
          ...classification.targets,
          unknown: allFiles.filter((file) => file !== classification.targets.left && file !== classification.targets.right),
        },
      };
    }
  }

  return { targets: classifyUf2Artifacts(allFiles) };
}

function mergeManifestTargets(
  manifestTargets: { left: string | null; right: string | null },
  byName: ClassifiedUf2Artifacts,
  uf2Files: string[],
): ClassifiedUf2Artifacts {
  let left = manifestTargets.left ?? byName.left;
  let right = manifestTargets.right ?? byName.right;

  if (left && right && left === right) {
    if (manifestTargets.left && manifestTargets.right) {
      left = null;
      right = null;
    } else if (manifestTargets.left) {
      right = null;
    } else if (manifestTargets.right) {
      left = null;
    } else {
      left = null;
      right = null;
    }
  }

  return {
    left,
    right,
    unknown: uniqueUf2Files(uf2Files).filter((file) => file !== left && file !== right),
  };
}

function uniqueUf2Files(files: string[]): string[] {
  return [...new Set(files.filter((file) => file.toLowerCase().endsWith(".uf2")))];
}

function targetsFromManifest(
  manifest: GitHubArtifactManifest,
  uf2Files: string[],
): { left: string | null; right: string | null } | null {
  let value: unknown;
  try {
    value = JSON.parse(manifest.contents);
  } catch {
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }

  const baseDir = dirname(manifest.name);
  let left = sideFileFromManifest(value, "left", baseDir, uf2Files);
  let right = sideFileFromManifest(value, "right", baseDir, uf2Files);
  const outputs = value.outputs;
  if (Array.isArray(outputs)) {
    for (const output of outputs) {
      if (!isRecord(output) || typeof output.file !== "string") {
        continue;
      }
      const resolved = resolveManifestFile(baseDir, output.file, uf2Files);
      const side = typeof output.side === "string" ? output.side.toLowerCase() : "";
      if (side === "left" && !left) {
        left = resolved;
      } else if (side === "right" && !right) {
        right = resolved;
      }
    }
  }

  return left || right ? { left, right } : null;
}

function sideFileFromManifest(value: Record<string, unknown>, side: "left" | "right", baseDir: string, uf2Files: string[]): string | null {
  const sideValue = value[side];
  if (typeof sideValue === "string") {
    return resolveManifestFile(baseDir, sideValue, uf2Files);
  }
  if (isRecord(sideValue) && typeof sideValue.file === "string") {
    return resolveManifestFile(baseDir, sideValue.file, uf2Files);
  }
  return null;
}

function resolveManifestFile(baseDir: string, file: string, uf2Files: string[]): string | null {
  const normalizedFile = normalizePath(file);
  const relativePath = baseDir ? `${baseDir}/${normalizedFile}` : normalizedFile;
  const filename = basename(normalizedFile);
  return (
    uf2Files.find((candidate) => {
      const normalizedCandidate = normalizePath(candidate);
      return (
        normalizedCandidate === normalizedFile ||
        normalizedCandidate === relativePath ||
        normalizedCandidate.endsWith(`/${normalizedFile}`) ||
        basename(normalizedCandidate) === filename
      );
    }) ?? null
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeBase64Text(value: string): string {
  const normalized = value.replace(/\s/g, "");
  const binary =
    typeof atob === "function"
      ? atob(normalized)
      : Buffer.from(normalized, "base64").toString("binary");
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function repoPath(ref: GitHubRepositoryRef): string {
  return `${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function dirname(path: string): string {
  const normalized = normalizePath(path);
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex === -1 ? "" : normalized.slice(0, slashIndex);
}

function basename(path: string): string {
  return normalizePath(path).split("/").pop() ?? path;
}
