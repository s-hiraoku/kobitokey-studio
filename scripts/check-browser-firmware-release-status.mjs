import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const DEFAULT_PRODUCTION_URL = "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware";
const RELEASE_GATE_JOB_NAME = "Browser firmware release gates";
const DEPLOY_WORKER_JOB_NAME = "deploy-browser-firmware-worker";
const GITHUB_WORKFLOW_URL = "https://github.com/s-hiraoku/kobitokey-studio/actions/workflows/pages.yml";
const GITHUB_OAUTH_APPS_URL = "https://github.com/settings/developers";
const CLOUDFLARE_DASHBOARD_URL = "https://dash.cloudflare.com/";
const RELEASE_PLAN_URL = "https://github.com/s-hiraoku/kobitokey-studio/blob/feature/firmware-mode/docs/browser-firmware-release-plan.md";
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
  - latest GitHub Actions release-gate job for current HEAD, or validated
    external E2E evidence for current HEAD when GitHub API reads are rate-limited
  - GitHub Actions production Worker deploy job evidence for current HEAD
  - production preflight against the given URL/current HEAD
  - OAuth client id and external E2E evidence availability

Options:
  --json
    Print a machine-readable status object. Secrets are not included. Each
    nextActions entry may include links and copy-ready commands with
    placeholder values.

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
const preflightOAuthClientId = process.env.BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID?.trim() || "";
const frontendOAuthClientId = process.env.VITE_GITHUB_OAUTH_CLIENT_ID?.trim() || "";

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
  worktreeStatus ? ["git status --short --branch"] : [],
);
record(
  "OAuth client id env",
  preflightOAuthClientId ? "pass" : "blocker",
  preflightOAuthClientId
    ? "BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID is set"
    : "BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID is missing",
  preflightOAuthClientId
    ? ""
    : "Set BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID and VITE_GITHUB_OAUTH_CLIENT_ID to the same public GitHub OAuth App client id locally, or configure the VITE_GITHUB_OAUTH_CLIENT_ID repository secret before the GitHub Actions production Worker deploy. The same public client id must be embedded in the deployed frontend bundle.",
  preflightOAuthClientId
    ? []
    : [
        "export VITE_GITHUB_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'",
        "export BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'",
      ],
  preflightOAuthClientId ? [] : [{ label: "GitHub OAuth Apps", url: GITHUB_OAUTH_APPS_URL }],
);
if (preflightOAuthClientId) {
  const frontendOAuthIssue = frontendOAuthClientId
    ? frontendOAuthClientId === preflightOAuthClientId
      ? ""
      : "VITE_GITHUB_OAUTH_CLIENT_ID does not match BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID; local production deploy will be rejected"
    : "VITE_GITHUB_OAUTH_CLIENT_ID is missing; local production deploy will be rejected";
  record(
    "frontend OAuth client id env",
    frontendOAuthIssue ? "warn" : "pass",
    frontendOAuthIssue || "VITE_GITHUB_OAUTH_CLIENT_ID matches BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID",
    frontendOAuthIssue
      ? "Set VITE_GITHUB_OAUTH_CLIENT_ID to the same public GitHub OAuth App client id before local production deploy. GitHub Actions deploy uses the VITE_GITHUB_OAUTH_CLIENT_ID repository secret."
      : "",
    frontendOAuthIssue ? ["export VITE_GITHUB_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'"] : [],
    frontendOAuthIssue ? [{ label: "GitHub OAuth Apps", url: GITHUB_OAUTH_APPS_URL }] : [],
  );
}
record(
  "Cloudflare token env",
  process.env.CLOUDFLARE_API_TOKEN?.trim() ? "pass" : "warn",
  process.env.CLOUDFLARE_API_TOKEN?.trim()
    ? "CLOUDFLARE_API_TOKEN is set"
    : "CLOUDFLARE_API_TOKEN is not set; an existing wrangler login may still work",
  process.env.CLOUDFLARE_API_TOKEN?.trim()
    ? ""
    : "Set CLOUDFLARE_API_TOKEN for GitHub Actions production Worker deploy, or confirm the local machine has a valid wrangler login.",
  process.env.CLOUDFLARE_API_TOKEN?.trim() ? [] : ["export CLOUDFLARE_API_TOKEN='<Cloudflare API token>'"],
  process.env.CLOUDFLARE_API_TOKEN?.trim() ? [] : [{ label: "Cloudflare Dashboard", url: CLOUDFLARE_DASHBOARD_URL }],
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
  mergeReadiness.status === 0 ? [] : ["npm run check:browser-firmware:merge-readiness"],
);

await checkGitHubActionsStatus({ branch, headSha, e2eReportPath });
checkProductionPreflight({ headSha, productionUrl });
checkExternalEvidence({ reportPath: e2eReportPath, headSha, productionUrl });

const blockers = checks.filter((check) => check.status === "blocker");
const warnings = checks.filter((check) => check.status === "warn");
const nextActions = checks
  .filter((check) => check.status === "blocker" || check.status === "warn")
  .filter((check) => check.action)
  .map((check) => ({
    name: check.name,
    status: check.status,
    action: check.action,
    ...(check.commands?.length ? { commands: check.commands } : {}),
    ...(check.links?.length ? { links: check.links } : {}),
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
      for (const link of nextAction.links ?? []) {
        console.log(`  - ${link.label}: ${link.url}`);
      }
      for (const command of nextAction.commands ?? []) {
        console.log(`  $ ${command}`);
      }
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

async function checkGitHubActionsStatus({ branch, headSha, e2eReportPath }) {
  const runsUrl = `${githubApiBaseUrl.replace(/\/$/, "")}/repos/s-hiraoku/kobitokey-studio/actions/runs?branch=${encodeURIComponent(branch)}&per_page=20`;
  let runs;
  try {
    runs = await fetchGitHubJson(runsUrl);
  } catch (error) {
    if (recordGitHubActionsFromExternalEvidence({ reportPath: e2eReportPath, headSha, error })) {
      return;
    }
    record(
      "GitHub Actions release gate",
      "blocker",
      `could not read workflow runs: ${formatError(error)}`,
      "Set BROWSER_FIRMWARE_RELEASE_STATUS_GITHUB_TOKEN or GITHUB_TOKEN if the GitHub API rate limit is blocking the Actions release-gate lookup, or pass a validated --e2e-report for the current HEAD.",
      [
        "export BROWSER_FIRMWARE_RELEASE_STATUS_GITHUB_TOKEN='<GitHub token with Actions read access>'",
        "npm run check:browser-firmware:release-status -- --json --e2e-report path/to/report.json",
      ],
      [{ label: "GitHub Actions Workflow", url: GITHUB_WORKFLOW_URL }],
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
      if (recordGitHubActionsFromExternalEvidence({ reportPath: e2eReportPath, headSha, error })) {
        return;
      }
      record(
        "GitHub Actions release gate",
        "blocker",
        `could not read jobs for run ${run.id}: ${formatError(error)}`,
        "Set BROWSER_FIRMWARE_RELEASE_STATUS_GITHUB_TOKEN or GITHUB_TOKEN if the GitHub API rate limit is blocking the Actions jobs lookup, or pass a validated --e2e-report for the current HEAD.",
        [
          "export BROWSER_FIRMWARE_RELEASE_STATUS_GITHUB_TOKEN='<GitHub token with Actions read access>'",
          "npm run check:browser-firmware:release-status -- --json --e2e-report path/to/report.json",
        ],
        [{ label: "GitHub Actions Workflow", url: GITHUB_WORKFLOW_URL }],
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
      "",
      [],
      workflowRunLinks("Release Gate Run", releaseGateRun.run),
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
      ["npm run check:browser-firmware:release-status -- --json"],
      [{ label: "GitHub Actions Workflow", url: GITHUB_WORKFLOW_URL }],
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
      "",
      [],
      workflowRunLinks("Production Worker Deploy Run", deployRun.run),
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
    `If deploying through GitHub Actions, open Actions > Deploy GitHub Pages, run workflow on ${branch} with deploy_browser_firmware_worker enabled, after repository secrets VITE_GITHUB_OAUTH_CLIENT_ID, CLOUDFLARE_ACCOUNT_ID, and CLOUDFLARE_API_TOKEN are configured. Export the same public OAuth client id locally before rerunning release-status. Production preflight remains the source of truth for local deploys.`,
    [
      "export VITE_GITHUB_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'",
      "export BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'",
      `gh workflow run pages.yml --ref ${shellQuote(branch)} -f deploy_browser_firmware_worker=true`,
      "npm run check:browser-firmware:release-status -- --json",
    ],
    [
      { label: "GitHub Actions Workflow", url: GITHUB_WORKFLOW_URL },
      { label: "Production URL", url: productionUrl },
    ],
  );
}

function recordGitHubActionsFromExternalEvidence({ reportPath, headSha, error }) {
  const report = readValidatedExternalEvidenceForHead(reportPath, headSha);
  if (!report) {
    return false;
  }
  const runUrl = report.ci?.runUrl || "external E2E report";
  record(
    "GitHub Actions release gate",
    "pass",
    `${runUrl} validated with ${RELEASE_GATE_JOB_NAME}=success for current HEAD after GitHub API lookup failed: ${formatError(error)}`,
    "",
    [],
    isHttpUrl(runUrl) ? [{ label: "External E2E CI Run", url: runUrl }] : [],
  );
  record(
    "production Worker deploy workflow",
    "warn",
    `GitHub API lookup failed: ${formatError(error)}; production Worker deploy workflow was not checked from Actions`,
    "Production preflight and external E2E evidence are the source of truth when GitHub API release-status reads are rate-limited. Set BROWSER_FIRMWARE_RELEASE_STATUS_GITHUB_TOKEN to also summarize the deploy workflow job.",
    ["export BROWSER_FIRMWARE_RELEASE_STATUS_GITHUB_TOKEN='<GitHub token with Actions read access>'"],
    [{ label: "GitHub Actions Workflow", url: GITHUB_WORKFLOW_URL }],
  );
  return true;
}

function readValidatedExternalEvidenceForHead(reportPath, headSha) {
  if (!reportPath || !existsSync(reportPath)) {
    return null;
  }
  const validation = run(process.execPath, ["scripts/check-browser-firmware-external-evidence.mjs", reportPath]);
  if (validation.status !== 0) {
    return null;
  }
  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch {
    return null;
  }
  return report?.ci?.appCommitSha === headSha &&
    report?.ci?.runHeadSha === headSha &&
    report?.production?.appCommitSha === headSha &&
    report?.ci?.releaseGateJobName === RELEASE_GATE_JOB_NAME &&
    report?.ci?.releaseGateJobConclusion === "success" &&
    report?.ci?.browserFirmwareReleaseCheckPassed === true
    ? report
    : null;
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
    preflight.status === 0
      ? []
      : [
          "export VITE_GITHUB_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'",
          "export BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'",
          "npm run deploy:browser-firmware",
          "npm run check:browser-firmware:release-status -- --json",
        ],
    preflight.status === 0
      ? []
      : [
          { label: "Production URL", url: productionUrl },
          { label: "GitHub Actions Workflow", url: GITHUB_WORKFLOW_URL },
        ],
  );
}

function checkExternalEvidence({ reportPath, headSha, productionUrl }) {
  if (!reportPath) {
    const releaseGateRunUrl = linkUrlForCheck("GitHub Actions release gate", "Release Gate Run");
    record(
      "external E2E evidence",
      "blocker",
      "--e2e-report or BROWSER_FIRMWARE_E2E_REPORT is required",
      "Generate an external E2E env template with npm run collect:browser-firmware:e2e-report -- --print-env-template, fill it on the QA machine, set BROWSER_FIRMWARE_E2E_BRANCH to the firmware repository branch used by Commit & Build, then collect the report with --out <report.json> --run-ui-smoke after production deploy and real left/right flash verification.",
      [
        externalEvidenceSeedCommand({ productionUrl, headSha, releaseGateRunUrl }),
        "source /tmp/browser-firmware-e2e.env",
        "npm run collect:browser-firmware:e2e-report -- --out path/to/report.json --run-ui-smoke",
        "npm run check:browser-firmware:release-status -- --json --e2e-report path/to/report.json",
        "VITE_GITHUB_OAUTH_CLIENT_ID='<GitHub OAuth App client id>' BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID='<GitHub OAuth App client id>' npm run check:browser-firmware:public-release -- --e2e-report path/to/report.json",
        "npm run write:browser-firmware:release-handoff -- --e2e-report path/to/report.json --out /tmp/browser-firmware-release-handoff.md",
        "npm run write:browser-firmware:release-bundle -- --e2e-report path/to/report.json --out-dir /tmp/browser-firmware-release-bundle",
      ],
      [
        { label: "Production URL", url: productionUrl },
        { label: "Release Plan", url: RELEASE_PLAN_URL },
      ],
    );
    return;
  }
  if (!existsSync(reportPath)) {
    record(
      "external E2E evidence",
      "blocker",
      `${reportPath} does not exist`,
      "Pass an existing external E2E report path with --e2e-report or BROWSER_FIRMWARE_E2E_REPORT.",
      ["npm run check:browser-firmware:release-status -- --json --e2e-report path/to/report.json"],
      [{ label: "Release Plan", url: RELEASE_PLAN_URL }],
    );
    return;
  }
  const evidence = run(process.execPath, ["scripts/check-browser-firmware-external-evidence.mjs", reportPath]);
  const report = evidence.status === 0 ? readExternalEvidenceReport(reportPath) : null;
  const reportIssues = report ? collectExternalEvidenceScopeIssues({ report, headSha, productionUrl }) : [];
  const passed = evidence.status === 0 && reportIssues.length === 0;
  record(
    "external E2E evidence",
    passed ? "pass" : "blocker",
    passed
      ? `${reportPath} passed evidence validation for current HEAD${isHttpsUrl(productionUrl) ? " and production URL" : ""}`
      : evidence.status === 0
        ? `${reportPath} is not valid for this release-status target: ${reportIssues.join("; ")}`
        : summarizeProcess(evidence),
    passed
      ? ""
      : "Fix the external E2E report values, regenerate it from production, or rerun check:browser-firmware:e2e-report for detailed validation errors.",
    passed ? [] : [`npm run check:browser-firmware:e2e-report -- ${reportPath}`],
    passed ? [] : [{ label: "Release Plan", url: RELEASE_PLAN_URL }],
  );
}

function readExternalEvidenceReport(reportPath) {
  try {
    return JSON.parse(readFileSync(reportPath, "utf8"));
  } catch {
    return null;
  }
}

function collectExternalEvidenceScopeIssues({ report, headSha, productionUrl }) {
  const issues = [];
  if (report?.ci?.appCommitSha !== headSha) {
    issues.push("ci.appCommitSha must match the current git HEAD");
  }
  if (report?.ci?.runHeadSha !== headSha) {
    issues.push("ci.runHeadSha must match the current git HEAD");
  }
  if (report?.production?.appCommitSha !== headSha) {
    issues.push("production.appCommitSha must match the current git HEAD");
  }
  if (isHttpsUrl(productionUrl) && !sameUrl(report?.production?.url, productionUrl)) {
    issues.push("production.url must match the release-status production URL");
  }
  return issues;
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function sameUrl(left, right) {
  try {
    return new URL(left).href === new URL(right).href;
  } catch {
    return left === right;
  }
}

function isHttpUrl(value) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function workflowRunLinks(label, run) {
  const url =
    typeof run?.html_url === "string" && run.html_url.trim()
      ? run.html_url.trim()
      : run?.id
        ? `https://github.com/s-hiraoku/kobitokey-studio/actions/runs/${run.id}`
        : "";
  return url ? [{ label, url }] : [];
}

function linkUrlForCheck(checkName, linkLabel) {
  const check = checks.find((item) => item.name === checkName);
  const link = check?.links?.find((item) => item.label === linkLabel);
  return link?.url || "";
}

function externalEvidenceSeedCommand({ productionUrl, headSha, releaseGateRunUrl }) {
  return [
    `BROWSER_FIRMWARE_E2E_PRODUCTION_URL=${shellQuote(productionUrl)}`,
    `BROWSER_FIRMWARE_E2E_CI_RUN_URL=${shellQuote(
      releaseGateRunUrl || "https://github.com/s-hiraoku/kobitokey-studio/actions/runs/<release-gate-run-id>",
    )}`,
    `BROWSER_FIRMWARE_E2E_APP_COMMIT_SHA=${shellQuote(headSha)}`,
    "npm run collect:browser-firmware:e2e-report -- --print-env-template > /tmp/browser-firmware-e2e.env",
  ].join(" \\\n  ");
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

function record(name, status, detail, action = "", commands = [], links = []) {
  checks.push({
    name,
    status,
    detail: detail.trim().replace(/\s+/g, " "),
    ...(action ? { action: action.trim().replace(/\s+/g, " ") } : {}),
    ...(commands.length ? { commands } : {}),
    ...(links.length ? { links } : {}),
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

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
