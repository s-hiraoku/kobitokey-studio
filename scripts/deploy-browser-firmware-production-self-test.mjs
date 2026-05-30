import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["scripts/deploy-browser-firmware-production.mjs", "--dry-run", "--skip-local-check", "--skip-merge-readiness"],
  {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  },
);

if (result.status === 0) {
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  throw new Error("Expected deploy wrapper to require an explicit reason for skip flags");
}

if (!result.stderr.includes("BROWSER_FIRMWARE_DEPLOY_SKIP_REASON is required when using deploy skip flags")) {
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  throw new Error("Expected deploy wrapper to explain the missing skip reason");
}

console.log("OK browser firmware production deploy self-test passed");
