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

env.WRANGLER_REGISTRY_PATH ??= join(browserFirmwareTmpDir, "kobitokey-wrangler-registry");
env.XDG_CONFIG_HOME ??= join(browserFirmwareTmpDir, "kobitokey-xdg-config");

mkdirSync(env.WRANGLER_REGISTRY_PATH, { recursive: true });
mkdirSync(env.XDG_CONFIG_HOME, { recursive: true });

runNode("scripts/check-browser-firmware-release.mjs");
runNode("scripts/check-browser-firmware-evidence-self-test.mjs");
runNode("scripts/check-browser-firmware-collector-self-test.mjs");
runNode("scripts/check-browser-firmware-merge-readiness-self-test.mjs");
runNode("scripts/check-browser-firmware-production-preflight-self-test.mjs");
runNode("scripts/check-browser-firmware-public-release-self-test.mjs");
runNode("scripts/check-browser-firmware-release-status-self-test.mjs");
runNode("scripts/write-browser-firmware-release-handoff-self-test.mjs");
runNode("scripts/write-browser-firmware-release-bundle-self-test.mjs");
runNode("scripts/deploy-browser-firmware-production-self-test.mjs");
runNode("scripts/deploy-browser-firmware-production.mjs", "--help");
runNode("scripts/collect-browser-firmware-e2e-evidence.mjs", "--help");
runNode("scripts/collect-browser-firmware-e2e-evidence.mjs", "--print-env-template");
runNode("scripts/write-browser-firmware-release-bundle.mjs", "--help");
runNode("node_modules/vitest/vitest.mjs", "run");
runNode("node_modules/typescript/bin/tsc");
runNode("node_modules/vite/bin/vite.js", "build");
runNode("node_modules/wrangler/bin/wrangler.js", "deploy", "--dry-run", "--outdir", workerDryRunOutDir);

function runNode(script, ...args) {
  run(process.execPath, [script, ...args]);
}

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
