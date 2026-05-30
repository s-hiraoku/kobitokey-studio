import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const publicReleaseScript = resolve("scripts/check-browser-firmware-public-release.mjs");
const templateReport = resolve("docs/browser-firmware-e2e-evidence.template.json");
const dir = mkdtempSync(join(tmpdir(), "browser-firmware-public-release-"));
const cleanRepoDir = createGitRepo("clean-release-");

try {
  const previewReport = join(dir, "preview.json");
  const invalidPublicOriginReport = join(dir, "invalid-public-origin.json");
  writeFileSync(previewReport, JSON.stringify(createPreviewReport(), null, 2));
  writeFileSync(invalidPublicOriginReport, JSON.stringify(createInvalidPublicOriginReport(), null, 2));

  const missingInputs = await runPublicRelease([], {});
  expectFailure(
    missingInputs,
    [
      "BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID is required",
      "--e2e-report <report.json> or BROWSER_FIRMWARE_E2E_REPORT is required",
    ],
    "Expected public release gate to require OAuth client id and E2E report",
  );

  const mismatchedArgumentUrl = await runPublicRelease(
    ["--skip-merge-readiness", "--skip-current-head", "--e2e-report", templateReport, "https://different.example.com/?mode=firmware"],
    {
      BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID: "dummy-client",
      BROWSER_FIRMWARE_RELEASE_SKIP_REASON: "self-test mismatch URL",
    },
  );
  expectFailure(
    mismatchedArgumentUrl,
    ["production-url argument must match e2e report production.url"],
    "Expected public release gate to reject a positional URL that differs from report production.url",
  );

  const mismatchedEnvironmentUrl = await runPublicRelease(
    ["--skip-merge-readiness", "--skip-current-head", "--e2e-report", templateReport],
    {
      BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID: "dummy-client",
      BROWSER_FIRMWARE_PRODUCTION_URL: "https://different.example.com/?mode=firmware",
      BROWSER_FIRMWARE_RELEASE_SKIP_REASON: "self-test mismatch URL",
    },
  );
  expectFailure(
    mismatchedEnvironmentUrl,
    ["BROWSER_FIRMWARE_PRODUCTION_URL must match e2e report production.url"],
    "Expected public release gate to reject an environment URL that differs from report production.url",
  );

  const previewUrl = await runPublicRelease(
    ["--skip-merge-readiness", "--skip-current-head", "--e2e-report", previewReport],
    {
      BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID: "dummy-client",
      BROWSER_FIRMWARE_RELEASE_SKIP_REASON: "self-test preview URL",
    },
  );
  expectFailure(
    previewUrl,
    [
      "e2e report production.url must use the expected public production origin",
      "production preflight URL must use the expected public production origin",
    ],
    "Expected public release gate to reject feature preview URLs as production evidence",
  );

  const mismatchedHead = await runPublicRelease(
    ["--skip-merge-readiness", "--e2e-report", templateReport],
    {
      BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID: "dummy-client",
      BROWSER_FIRMWARE_RELEASE_SKIP_REASON: "self-test mismatched head",
    },
  );
  expectFailure(
    mismatchedHead,
    ["e2e report ci.appCommitSha must match the current git HEAD"],
    "Expected public release gate to reject E2E evidence from a different commit",
  );

  const invalidEvidence = await runPublicRelease(
    ["--skip-merge-readiness", "--skip-current-head", "--e2e-report", invalidPublicOriginReport],
    {
      BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID: "dummy-client",
      BROWSER_FIRMWARE_RELEASE_SKIP_REASON: "self-test invalid evidence",
    },
  );
  expectFailure(
    invalidEvidence,
    ["production.appCommitSha must not be a placeholder SHA"],
    "Expected public release gate to validate external evidence before production preflight",
  );
  expectNoOutput(
    invalidEvidence,
    ["production page is missing Content-Security-Policy"],
    "Expected invalid external evidence to stop before production preflight",
  );

  const missingSkipReason = await runPublicRelease(
    ["--skip-merge-readiness", "--skip-current-head", "--e2e-report", templateReport],
    { BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID: "dummy-client" },
  );
  expectFailure(
    missingSkipReason,
    ["BROWSER_FIRMWARE_RELEASE_SKIP_REASON is required when using public-release skip flags"],
    "Expected public release gate to require an explicit reason for skip flags",
  );

  const dirtyWorktree = await runDirtyWorktreePublicRelease();
  expectFailure(
    dirtyWorktree,
    ["working tree is dirty; commit or stash changes before public release gate"],
    "Expected public release gate to reject a dirty git worktree",
  );
  expectNoOutput(
    dirtyWorktree,
    ["production page is missing Content-Security-Policy"],
    "Expected dirty worktree to stop before production preflight",
  );

  console.log("OK browser firmware public release self-test passed");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

function expectFailure(result, expectedMessages, message) {
  if (result.status === 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(message);
  }
  for (const expected of expectedMessages) {
    if (!result.stderr.includes(expected)) {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      throw new Error(`${message}: missing "${expected}"`);
    }
  }
}

function expectNoOutput(result, unexpectedMessages, message) {
  for (const unexpected of unexpectedMessages) {
    if (result.stdout.includes(unexpected) || result.stderr.includes(unexpected)) {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      throw new Error(`${message}: found "${unexpected}"`);
    }
  }
}

function runPublicRelease(args, env = {}) {
  return runPublicReleaseInCwd(cleanRepoDir, args, env);
}

function runPublicReleaseInCwd(cwd, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [publicReleaseScript, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({ status: 1, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("close", (status) => {
      resolve({ status: status ?? 1, stdout, stderr });
    });
  });
}

async function runDirtyWorktreePublicRelease() {
  const repoDir = createGitRepo("dirty-release-");
  writeFileSync(join(repoDir, "dirty.txt"), "not committed\n");

  return runPublicReleaseInCwd(
    repoDir,
    ["--skip-merge-readiness", "--skip-current-head", "--e2e-report", templateReport],
    {
      BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID: "dummy-client",
      BROWSER_FIRMWARE_RELEASE_SKIP_REASON: "self-test dirty worktree",
    },
  );
}

function createGitRepo(prefix) {
  const repoDir = mkdtempSync(join(dir, prefix));
  runGit(repoDir, ["init"]);
  runGit(repoDir, ["config", "user.email", "kobitokey-release-self-test@example.com"]);
  runGit(repoDir, ["config", "user.name", "KobitoKey Release Self Test"]);
  writeFileSync(join(repoDir, "README.md"), "release self-test\n");
  runGit(repoDir, ["add", "README.md"]);
  runGit(repoDir, ["commit", "-m", "Initial commit"]);
  return repoDir;
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
}

function createPreviewReport() {
  const report = JSON.parse(readFileSync(templateReport, "utf8"));
  report.production.url = "https://feature-firmware-mode-kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware";
  return report;
}

function createInvalidPublicOriginReport() {
  const report = JSON.parse(readFileSync(templateReport, "utf8"));
  report.production.url = "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware";
  report.production.fetchUrl = "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware";
  return report;
}
