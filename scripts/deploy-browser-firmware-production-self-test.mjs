import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const deployScript = resolve("scripts/deploy-browser-firmware-production.mjs");

const result = spawnSync(
  process.execPath,
  [deployScript, "--dry-run", "--skip-local-check", "--skip-merge-readiness"],
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
    deployScript,
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

const dirtyDeploy = runDirtyDeploySelfTest();
if (dirtyDeploy.status === 0) {
  process.stdout.write(dirtyDeploy.stdout);
  process.stderr.write(dirtyDeploy.stderr);
  throw new Error("Expected production deploy wrapper to reject dirty worktrees before deploy");
}
if (!dirtyDeploy.stderr.includes("working tree is dirty; commit or stash changes before production deploy")) {
  process.stdout.write(dirtyDeploy.stdout);
  process.stderr.write(dirtyDeploy.stderr);
  throw new Error("Expected production deploy wrapper to explain dirty worktree rejection");
}

console.log("OK browser firmware production deploy self-test passed");

function runDirtyDeploySelfTest() {
  const dir = mkdtempSync(join(tmpdir(), "browser-firmware-dirty-deploy-"));
  try {
    runGit(dir, ["init"]);
    runGit(dir, ["config", "user.email", "self-test@example.com"]);
    runGit(dir, ["config", "user.name", "Browser Firmware Self Test"]);
    writeFileSync(join(dir, "README.md"), "clean\n");
    runGit(dir, ["add", "README.md"]);
    runGit(dir, ["commit", "-m", "initial"]);
    writeFileSync(join(dir, "README.md"), "dirty\n");

    return spawnSync(
      process.execPath,
      [deployScript, "--skip-local-check", "--skip-merge-readiness"],
      {
        cwd: dir,
        env: {
          ...process.env,
          BROWSER_FIRMWARE_DEPLOY_SKIP_REASON: "self-test dirty deploy",
        },
        encoding: "utf8",
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`git ${args.join(" ")} failed`);
  }
}
