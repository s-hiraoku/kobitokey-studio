import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const DEFAULT_PRODUCTION_URL = "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware";
const RELEASE_GATE_JOB_NAME = "Browser firmware release gates";
const DEPLOY_WORKER_JOB_NAME = "deploy-browser-firmware-worker";
const args = process.argv.slice(2);
const githubApiBaseUrl =
  process.env.BROWSER_FIRMWARE_RELEASE_STATUS_GITHUB_API_BASE_URL?.trim() || "https://api.github.com";
const allowDirty = args.includes("--allow-dirty") || process.env.BROWSER_FIRMWARE_RELEASE_STATUS_ALLOW_DIRTY === "true";
const outputJson = args.includes("--json");

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: node scripts/check-browser-firmware-release-status.mjs [production-url] [--e2e-report <report.json>] [--json]

Summarizes the current browser Firmware Mode public-release blockers without
printing secrets. This is a readiness dashboard, not a deploy command.

Checks:
  - current git HEAD and worktree cleanliness
  - merge readiness against origin/main
  - latest GitHub Actions release-gate job for current HEAD
  - GitHub Actions production Worker deploy job evidence for current HEAD
  - production preflight against the given URL/current HEAD
  - OAuth client id and external E2E evidence availability

Options:
  --json
    Print a machine-readable status object. Secrets are not included.

Environment:
  BROWSER_FIRMWARE_PRODUCTION_URL
    Production URL when no positional URL is provided. Defaults to
    ${DEFAULT_PRODUCTION_URL}
  BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID
    Required before public release and production deploy.
  BROWSER_FIRMWARE_E2E_REPORT
    External E2E evidence report path when --e2e-report is omitted.
  GITHUB_TOKEN
    Optional fallback token for GitHub API reads.
  BROWSER_FIRMWARE_RELEASE_STATUS_GITHUB_TOKEN
    Optional token used only to avoid unauthenticated GitHub API rate limits.
    Prefer this over GITHUB_TOKEN for local release-status checks.
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
  worktreeStatus
    ? allowDirty
      ? "Run release-status again from a clean worktree before making the public-release decision."
      : "Commit or stash changes, then rerun release-status."
    : "",
);
record(
  "OAuth client id env",
  process.env.BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID?.trim() ? "pass" : "blocker",
  process.env.BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID?.trim()
    ? "BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID is set"
    : "BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID is missing",
  process.env.BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID?.trim()
    ? ""
    : "Set BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID locally, or configure the VITE_GITHUB_OAUTH_CLIENT_ID repository secret before the GitHub Actions production Worker deploy. The same public client id must be embedded in the deployed frontend bundle.",
);
record(
  "Cloudflare token env",
  process.env.CLOUDFLARE_API_TOKEN?.trim() ? "pass" : "warn",
  process.env.CLOUDFLARE_API_TOKEN?.trim()
    ? "CLOUDFLARE_API_TOKEN is set"
    : "CLOUDFLARE_API_TOKEN is not set; an existing wrangler login may still work",
  process.env.CLOUDFLARE_API_TOKEN?.trim()
    ? ""
    : "Set CLOUDFLARE_API_TOKEN for GitHub Actions production Worker deploy, or confirm the local machine has a valid wrangler login.",
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
  mergeReadiness.status === 0
    ? ""
    : "Merge or rebase origin/main into the branch, resolve conflicts if any, then rerun release-status from a clean worktree.",
);

await checkGitHubActionsStatus({ branch, headSha });
checkProductionPreflight({ headSha, productionUrl });
checkExternalEvidence(e2eReportPath);

const blockers = checks.filter((check) => check.status === "blocker");
const warnings = checks.filter((check) => check.status === "warn");
const nextActions = checks
  .filter((check) => check.status === "blocker" || check.status === "warn")
  .filter((check) => check.action)
  .map((check) => ({
    name: check.name,
    status: check.status,
    action: check.action,
  }))
  .filter(Boolean);

if (outputJson) {
  console.log(
    JSON.stringify(
      {
        ready: blockers.length === 0,
        headSha,
        shortHead,
        branch,
        productionUrl,
        blockerCount: blockers.length,
        warningCount: warnings.length,
        nextActions,
        checks,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`Browser Firmware Mode release status for ${shortHead}`);
  for (const check of checks) {
    console.log(`${statusLabel(check.status)} ${check.name}: ${check.detail}`);
  }
  if (nextActions.length > 0) {
    console.log("Next actions:");
    for (const nextAction of nextActions) {
      console.log(`- ${nextAction.name}: ${nextAction.action}`);
    }
  }
  console.log(`Summary: ${blockers.length} blocker(s), ${warnings.length} warning(s)`);
}

if (blockers.length > 0) {
  process.exit(1);
}

function readOption(name) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : "";
}

async function checkGitHubActionsStatus({ branch, headSha }) {
  const runsUrl = `${githubApiBaseUrl.replace(/\/$/, "")}/repos/s-hiraoku/kobitokey-studio/actions/runs?branch=${encodeURIComponent(branch)}&per_page=20`;
  let runs;
  try {
    runs = await fetchGitHubJson(runsUrl);
  } catch (error) {
    record(
      "GitHub Actions release gate",
      "blocker",
      `could not read workflow runs: ${formatError(error)}`,
      "Set BROWSER_FIRMWARE_RELEASE_STATUS_GITHUB_TOKEN or GITHUB_TOKEN if the GitHub API rate limit is blocking the Actions release-gate lookup.",
    );
    return;
  }

  const headRuns = (runs.workflow_runs ?? []).filter((run) => run.head_sha === headSha);
  const headRunJobs = [];
  for (const run of headRuns) {
    let jobs;
    try {
      jobs = await fetchGitHubJson(run.jobs_url);
    } catch (error) {
      record(
        "GitHub Actions release gate",
        "blocker",
        `could not read jobs for run ${run.id}: ${formatError(error)}`,
        "Set BROWSER_FIRMWARE_RELEASE_STATUS_GITHUB_TOKEN or GITHUB_TOKEN if the GitHub API rate limit is blocking the Actions jobs lookup.",
      );
      return;
    }
    headRunJobs.push({ run, jobs: jobs.jobs ?? [] });
  }

  const releaseGateRun = headRunJobs.find(({ jobs }) =>
    jobs.some((job) => job.name === RELEASE_GATE_JOB_NAME && job.status === "completed" && job.conclusion === "success"),
  );
  if (releaseGateRun) {
    record(
      "GitHub Actions release gate",
      "pass",
      `${releaseGateRun.run.event} run ${releaseGateRun.run.id} completed with ${RELEASE_GATE_JOB_NAME}=success`,
    );
  } else {
    const runSummary =
      headRuns.map((run) => `${run.event} run ${run.id} ${run.status}/${run.conclusion ?? "pending"}`).join("; ") ||
      "no workflow run found for current HEAD";
    record(
      "GitHub Actions release gate",
      "blocker",
      runSummary,
      "Wait for the current HEAD's Browser firmware release gates job to complete successfully, then rerun release-status.",
    );
  }

  const deployRun = headRunJobs.find(({ jobs }) =>
    jobs.some((job) => job.name === DEPLOY_WORKER_JOB_NAME && job.status === "completed" && job.conclusion === "success"),
  );
  if (deployRun) {
    record(
      "production Worker deploy workflow",
      "pass",
      `${deployRun.run.event} run ${deployRun.run.id} completed with ${DEPLOY_WORKER_JOB_NAME}=success`,
    );
    return;
  }

  const deploySummary =
    headRunJobs
      .flatMap(({ run, jobs }) =>
        jobs
          .filter((job) => job.name === DEPLOY_WORKER_JOB_NAME)
          .map((job) => `${run.event} run ${run.id} ${job.status}/${job.conclusion ?? "pending"}`),
      )
      .join("; ") || "no production Worker deploy job found for current HEAD";
  record(
    "production Worker deploy workflow",
    "warn",
    deploySummary,
    `If deploying through GitHub Actions, open Actions > Deploy GitHub Pages, run workflow on ${branch} with deploy_browser_firmware_worker enabled, after repository secrets VITE_GITHUB_OAUTH_CLIENT_ID, CLOUDFLARE_ACCOUNT_ID, and CLOUDFLARE_API_TOKEN are configured. Production preflight remains the source of truth for local deploys.`,
  );
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
    preflight.status === 0
      ? ""
      : "Deploy the current commit to the production Worker with npm run deploy:browser-firmware or Actions > Deploy GitHub Pages with deploy_browser_firmware_worker enabled, then rerun release-status against the same production URL/current HEAD.",
  );
}

function checkExternalEvidence(reportPath) {
  if (!reportPath) {
    record(
      "external E2E evidence",
      "blocker",
      "--e2e-report or BROWSER_FIRMWARE_E2E_REPORT is required",
      "Generate an external E2E env template with npm run collect:browser-firmware:e2e-report -- --print-env-template, fill it on the QA machine, set BROWSER_FIRMWARE_E2E_BRANCH to the firmware repository branch used by Commit & Build, then collect the report with --out <report.json> --run-ui-smoke after production deploy and real left/right flash verification.",
    );
    return;
  }
  if (!existsSync(reportPath)) {
    record(
      "external E2E evidence",
      "blocker",
      `${reportPath} does not exist`,
      "Pass an existing external E2E report path with --e2e-report or BROWSER_FIRMWARE_E2E_REPORT.",
    );
    return;
  }
  const evidence = run(process.execPath, ["scripts/check-browser-firmware-external-evidence.mjs", reportPath]);
  record(
    "external E2E evidence",
    evidence.status === 0 ? "pass" : "blocker",
    evidence.status === 0 ? `${reportPath} passed evidence validation` : summarizeProcess(evidence),
    evidence.status === 0
      ? ""
      : "Fix the external E2E report values, regenerate it from production, or rerun check:browser-firmware:e2e-report for detailed validation errors.",
  );
}

async function fetchGitHubJson(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "kobitokey-studio-release-status",
  };
  const token = process.env.BROWSER_FIRMWARE_RELEASE_STATUS_GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text();
    if (response.status === 403 && body.toLowerCase().includes("rate limit")) {
      throw new Error(
        "GitHub API 403 rate limit: set BROWSER_FIRMWARE_RELEASE_STATUS_GITHUB_TOKEN or GITHUB_TOKEN for release-status checks",
      );
    }
    throw new Error(`GitHub API ${response.status}: ${body}`);
  }
  return response.json();
}

function record(name, status, detail, action = "") {
  checks.push({
    name,
    status,
    detail: detail.trim().replace(/\s+/g, " "),
    ...(action ? { action: action.trim().replace(/\s+/g, " ") } : {}),
  });
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
