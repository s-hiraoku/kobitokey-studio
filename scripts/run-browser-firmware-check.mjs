import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const browserFirmwareTmpDir = process.env.BROWSER_FIRMWARE_TMP_DIR || process.env.RUNNER_TEMP || tmpdir();
const wranglerLogPath = process.env.WRANGLER_LOG_PATH || join(browserFirmwareTmpDir, "kobitokey-wrangler-logs");
const workerDryRunOutDir = process.env.BROWSER_FIRMWARE_WORKER_DRY_RUN_OUTDIR || join(browserFirmwareTmpDir, "kobitokey-worker-dry-run");

mkdirSync(wranglerLogPath, { recursive: true });
mkdirSync(workerDryRunOutDir, { recursive: true });

const env = {
  ...process.env,
  WRANGLER_LOG_PATH: wranglerLogPath,
};

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

run("node", ["scripts/check-browser-firmware-release.mjs"]);
run("node", ["scripts/check-browser-firmware-evidence-self-test.mjs"]);
run("node", ["scripts/check-browser-firmware-collector-self-test.mjs"]);
run("node", ["scripts/check-browser-firmware-merge-readiness-self-test.mjs"]);
run("node", ["scripts/check-browser-firmware-production-preflight-self-test.mjs"]);
run("node", ["scripts/collect-browser-firmware-e2e-evidence.mjs", "--help"]);
run(npmCommand, ["test"]);
run(npmCommand, ["run", "build"]);
run(npxCommand, ["wrangler", "deploy", "--dry-run", "--outdir", workerDryRunOutDir]);

function run(command, args) {
  const label = [command, ...args].join(" ");
  console.log(`\n$ ${label}`);
  const result = spawnSync(command, args, {
    env,
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
