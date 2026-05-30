import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const DEFAULT_PRODUCTION_URL = "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware";
const RELEASE_GATE_JOB_NAME = "Browser firmware release gates";
const args = process.argv.slice(2);
const githubApiBaseUrl =
  process.env.BROWSER_FIRMWARE_RELEASE_STATUS_GITHUB_API_BASE_URL?.trim() || "https://api.github.com";
const allowDirty = args.includes("--allow-dirty") || process.env.BROWSER_FIRMWARE_RELEASE_STATUS_ALLOW_DIRTY === "true";

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: node scripts/check-browser-firmware-release-status.mjs [production-url] [--e2e-report <report.json>]

Summarizes the current browser Firmware Mode public-release blockers without
printing secrets. This is a readiness dashboard, not a deploy command.

Checks:
  - current git HEAD and worktree cleanliness
  - merge readiness against origin/main
  - latest GitHub Actions release-gate job for current HEAD
  - production preflight against the given URL/current HEAD
  - OAuth client id and external E2E evidence availability

Environment:
  BROWSER_FIRMWARE_PRODUCTION_URL
    Production URL when no positional URL is provided. Defaults to
    ${DEFAULT_PRODUCTION_URL}
  BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID
    Required before public release and production deploy.
  BROWSER_FIRMWARE_E2E_REPORT
    External E2E evidence report path when --e2e-report is omitted.
  GITHUB_TOKEN
    Optional, used only to avoid unauthenticated GitHub API rate limits.
  BROWSER_FIRMWARE_RELEASE_STATUS_ALLOW_DIRTY=true
    Reports a dirty worktree as a warning. Use for diagnostics only, not for
    public release decisions.
  BROWSER_FIRMWARE_RELEASE_STATUS_GITHUB_API_BASE_URL
    Test-only GitHub API base URL override.`);
  process.exit(0);
}

const productionUrl =
  args.find((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--e2e-report") ||
  process.env.BROWSER_FIRMWARE_PRODUCTION_URL ||
  DEFAULT_PRODUCTION_URL;
const e2eReportPath = readOption("--e2e-report") || process.env.BROWSER_FIRMWARE_E2E_REPORT || "";
const checks = [];

const headSha = git(["rev-parse", "HEAD"]).stdout.trim();
const shortHead = headSha.slice(0, 7);
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
const worktreeStatus = git(["status", "--porcelain"]).stdout.trim();

record("current git HEAD", "pass", `${shortHead} on ${branch}`);
record(
  "working tree clean",
  worktreeStatus ? (allowDirty ? "warn" : "blocker") : "pass",
  worktreeStatus
    ? allowDirty
      ? "dirty worktree ignored for diagnostic status"
      : "commit or stash changes before deploy/public-release gate"
    : "clean",
);
record(
  "OAuth client id env",
  process.env.BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID?.trim() ? "pass" : "blocker",
  process.env.BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID?.trim()
    ? "BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID is set"
    : "BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID is missing",
);
record(
  "Cloudflare token env",
  process.env.CLOUDFLARE_API_TOKEN?.trim() ? "pass" : "warn",
  process.env.CLOUDFLARE_API_TOKEN?.trim()
    ? "CLOUDFLARE_API_TOKEN is set"
    : "CLOUDFLARE_API_TOKEN is not set; an existing wrangler login may still work",
);

const mergeReadinessArgs = ["scripts/check-browser-firmware-merge-readiness.mjs"];
if (allowDirty) {
  mergeReadinessArgs.push("--allow-dirty");
}
const mergeReadiness = run(process.execPath, mergeReadinessArgs);
record(
  "merge readiness",
  mergeReadiness.status === 0 ? "pass" : "blocker",
  summarizeProcess(mergeReadiness),
);

await checkReleaseGateCi({ branch, headSha });
checkProductionPreflight({ headSha, productionUrl });
checkExternalEvidence(e2eReportPath);

const blockers = checks.filter((check) => check.status === "blocker");
const warnings = checks.filter((check) => check.status === "warn");

console.log(`Browser Firmware Mode release status for ${shortHead}`);
for (const check of checks) {
  console.log(`${statusLabel(check.status)} ${check.name}: ${check.detail}`);
}
console.log(`Summary: ${blockers.length} blocker(s), ${warnings.length} warning(s)`);

if (blockers.length > 0) {
  process.exit(1);
}

function readOption(name) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : "";
}

async function checkReleaseGateCi({ branch, headSha }) {
  const runsUrl = `${githubApiBaseUrl.replace(/\/$/, "")}/repos/s-hiraoku/kobitokey-studio/actions/runs?branch=${encodeURIComponent(branch)}&per_page=20`;
  let runs;
  try {
    runs = await fetchGitHubJson(runsUrl);
  } catch (error) {
    record("GitHub Actions release gate", "blocker", `could not read workflow runs: ${formatError(error)}`);
    return;
  }

  const headRuns = (runs.workflow_runs ?? []).filter((run) => run.head_sha === headSha);
  for (const run of headRuns) {
    let jobs;
    try {
      jobs = await fetchGitHubJson(run.jobs_url);
    } catch (error) {
      record("GitHub Actions release gate", "blocker", `could not read jobs for run ${run.id}: ${formatError(error)}`);
      return;
    }
    const releaseGateJob = (jobs.jobs ?? []).find((job) => job.name === RELEASE_GATE_JOB_NAME);
    if (releaseGateJob?.status === "completed" && releaseGateJob.conclusion === "success") {
      record("GitHub Actions release gate", "pass", `${run.event} run ${run.id} completed with ${RELEASE_GATE_JOB_NAME}=success`);
      return;
    }
  }

  const runSummary =
    headRuns.map((run) => `${run.event} run ${run.id} ${run.status}/${run.conclusion ?? "pending"}`).join("; ") ||
    "no workflow run found for current HEAD";
  record("GitHub Actions release gate", "blocker", runSummary);
}

function checkProductionPreflight({ headSha, productionUrl }) {
  const preflight = run(
    process.execPath,
    ["scripts/check-browser-firmware-production-preflight.mjs", productionUrl],
    { BROWSER_FIRMWARE_PREFLIGHT_APP_COMMIT_SHA: headSha },
  );
  record(
    "production preflight",
    preflight.status === 0 ? "pass" : "blocker",
    preflight.status === 0 ? `passed for ${productionUrl}` : summarizeProcess(preflight),
  );
}

function checkExternalEvidence(reportPath) {
  if (!reportPath) {
    record("external E2E evidence", "blocker", "--e2e-report or BROWSER_FIRMWARE_E2E_REPORT is required");
    return;
  }
  if (!existsSync(reportPath)) {
    record("external E2E evidence", "blocker", `${reportPath} does not exist`);
    return;
  }
  const evidence = run(process.execPath, ["scripts/check-browser-firmware-external-evidence.mjs", reportPath]);
  record(
    "external E2E evidence",
    evidence.status === 0 ? "pass" : "blocker",
    evidence.status === 0 ? `${reportPath} passed evidence validation` : summarizeProcess(evidence),
  );
}

async function fetchGitHubJson(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "kobitokey-studio-release-status",
  };
  if (process.env.GITHUB_TOKEN?.trim()) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN.trim()}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function record(name, status, detail) {
  checks.push({ name, status, detail: detail.trim().replace(/\s+/g, " ") });
}

function statusLabel(status) {
  switch (status) {
    case "pass":
      return "PASS";
    case "warn":
      return "WARN";
    case "blocker":
      return "BLOCKER";
    default:
      return status.toUpperCase();
  }
}

function git(args) {
  const result = run("git", args);
  if (result.status !== 0) {
    process.stderr.write(summarizeProcess(result));
    process.exit(result.status ?? 1);
  }
  return result;
}

function run(command, commandArgs, extraEnv = {}) {
  return spawnSync(command, commandArgs, {
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function summarizeProcess(result) {
  const output = `${result.stdout || ""}\n${result.stderr || ""}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join("; ");
  return output || `exit status ${result.status ?? 1}`;
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
