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

const invalidUrl = spawnSync(
  process.execPath,
  [
    "scripts/deploy-browser-firmware-production.mjs",
    "--dry-run",
    "--skip-local-check",
    "--skip-merge-readiness",
    "https://example.com/",
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BROWSER_FIRMWARE_DEPLOY_SKIP_REASON: "self-test invalid deploy URL",
    },
    encoding: "utf8",
  },
);

if (invalidUrl.status === 0) {
  process.stdout.write(invalidUrl.stdout);
  process.stderr.write(invalidUrl.stderr);
  throw new Error("Expected deploy wrapper to reject invalid production URLs before deploy");
}

for (const expected of [
  "production URL must include mode=firmware",
  "production URL must use the expected public production origin",
]) {
  if (!invalidUrl.stderr.includes(expected)) {
    process.stdout.write(invalidUrl.stdout);
    process.stderr.write(invalidUrl.stderr);
    throw new Error(`Expected deploy wrapper invalid URL output to include: ${expected}`);
  }
}

console.log("OK browser firmware production deploy self-test passed");
