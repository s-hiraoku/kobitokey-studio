import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_PRODUCTION_URL = "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware";
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const requireOAuth = args.includes("--require-oauth") || process.env.BROWSER_FIRMWARE_PREFLIGHT_REQUIRE_OAUTH === "true";
const skipLocalCheck = args.includes("--skip-local-check");
const skipMergeReadiness = args.includes("--skip-merge-readiness");
const skipReason = process.env.BROWSER_FIRMWARE_DEPLOY_SKIP_REASON?.trim() || "";
const productionUrl =
  args.find((arg) => !arg.startsWith("--")) || process.env.BROWSER_FIRMWARE_PRODUCTION_URL || DEFAULT_PRODUCTION_URL;

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: node scripts/deploy-browser-firmware-production.mjs [production-url]
       node scripts/deploy-browser-firmware-production.mjs --require-oauth [production-url]
       node scripts/deploy-browser-firmware-production.mjs --dry-run [production-url]

Builds and deploys the browser Firmware Mode Worker, then verifies the deployed
production URL against the current git HEAD through /api/release-metadata.

Default URL:
  ${DEFAULT_PRODUCTION_URL}

Environment:
  BROWSER_FIRMWARE_PRODUCTION_URL
    Production URL to preflight when no positional production-url is provided.
  BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID
    When set, the post-deploy preflight also verifies the deployed Worker can
    start GitHub OAuth device flow and the frontend bundle embeds the client id.
  BROWSER_FIRMWARE_PREFLIGHT_REQUIRE_OAUTH=true
    Same as --require-oauth.
  BROWSER_FIRMWARE_TMP_DIR or RUNNER_TEMP
    Directory used for Wrangler logs and dry-run output.
  BROWSER_FIRMWARE_DEPLOY_SKIP_REASON
    Required when using --skip-local-check or --skip-merge-readiness.

Options:
  --require-oauth
    Fail post-deploy preflight unless BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID
    is set and works against production.
  --dry-run
    Run the local checks, build, and Wrangler dry-run packaging without changing
    production. Post-deploy preflight is skipped.
  --skip-local-check
    Skip npm run check:browser-firmware. Use only after it passed on the same
    commit.
  --skip-merge-readiness
    Skip origin/main merge-readiness check. Use only for intentional emergency
    deploys.`);
  process.exit(0);
}

const browserFirmwareTmpDir = process.env.BROWSER_FIRMWARE_TMP_DIR || process.env.RUNNER_TEMP || tmpdir();
const wranglerLogPath = process.env.WRANGLER_LOG_PATH || join(browserFirmwareTmpDir, "kobitokey-wrangler-logs");
const workerDryRunOutDir =
  process.env.BROWSER_FIRMWARE_WORKER_DRY_RUN_OUTDIR || join(browserFirmwareTmpDir, "kobitokey-worker-dry-run");
const env = {
  ...process.env,
  WRANGLER_LOG_PATH: wranglerLogPath,
};

mkdirSync(wranglerLogPath, { recursive: true });
mkdirSync(workerDryRunOutDir, { recursive: true });

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const headSha = readGitHeadSha();

if (!headSha) {
  console.error("Current git HEAD could not be read; refusing to deploy without a commit SHA.");
  process.exit(1);
}
if ((skipLocalCheck || skipMergeReadiness) && !skipReason) {
  console.error("BROWSER_FIRMWARE_DEPLOY_SKIP_REASON is required when using deploy skip flags.");
  process.exit(1);
}

if (!skipMergeReadiness) {
  run("node", ["scripts/check-browser-firmware-merge-readiness.mjs"]);
}
if (!skipLocalCheck) {
  run(npmCommand, ["run", "check:browser-firmware"]);
}
run(npmCommand, ["run", "build"]);

if (dryRun) {
  run(npxCommand, ["wrangler", "deploy", "--dry-run", "--outdir", workerDryRunOutDir]);
  console.log(`OK browser Firmware Mode production deploy dry-run passed for ${headSha}`);
  process.exit(0);
}

run(npxCommand, ["wrangler", "deploy"]);

const preflightArgs = ["scripts/check-browser-firmware-production-preflight.mjs"];
if (requireOAuth || process.env.BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID?.trim()) {
  preflightArgs.push("--require-oauth");
}
preflightArgs.push(productionUrl);
run("node", preflightArgs, { BROWSER_FIRMWARE_PREFLIGHT_APP_COMMIT_SHA: headSha });

console.log(`OK browser Firmware Mode production deploy verified at ${productionUrl} for ${headSha}`);

function readGitHeadSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function run(command, commandArgs, extraEnv = {}) {
  const label = [command, ...commandArgs].join(" ");
  console.log(`\n$ ${label}`);
  const result = spawnSync(command, commandArgs, {
    env: { ...env, ...extraEnv },
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`Failed to run ${label}`);
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
