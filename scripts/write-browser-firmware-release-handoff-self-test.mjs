import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const dir = mkdtempSync(join(tmpdir(), "browser-firmware-handoff-"));

try {
  const statusPath = join(dir, "release-status.json");
  const handoffPath = join(dir, "handoff.md");
  writeFileSync(statusPath, JSON.stringify(createStatusFixture(), null, 2));

  const stdoutResult = runHandoff(["--status-json", statusPath]);
  if (stdoutResult.status !== 0) {
    process.stderr.write(stdoutResult.stderr);
    process.stdout.write(stdoutResult.stdout);
    throw new Error("Expected handoff stdout render to pass");
  }
  assertHandoff(stdoutResult.stdout);

  const outResult = runHandoff(["--status-json", statusPath, "--out", handoffPath]);
  if (outResult.status !== 0) {
    process.stderr.write(outResult.stderr);
    process.stdout.write(outResult.stdout);
    throw new Error("Expected handoff file render to pass");
  }
  if (!outResult.stdout.includes("OK wrote browser Firmware Mode release handoff")) {
    process.stdout.write(outResult.stdout);
    throw new Error("Expected --out mode to report the written handoff path");
  }
  assertHandoff(readFileSync(handoffPath, "utf8"));

  const help = runHandoff(["--help"]);
  if (help.status !== 0 || !help.stdout.includes("--status-json") || !help.stdout.includes("--out <handoff.md>")) {
    process.stdout.write(help.stdout);
    process.stderr.write(help.stderr);
    throw new Error("Expected handoff help to document status-json and out options");
  }

  console.log("OK browser firmware release handoff self-test passed");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

function runHandoff(args) {
  return spawnSync(process.execPath, ["scripts/write-browser-firmware-release-handoff.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

function assertHandoff(markdown) {
  for (const expected of [
    "# Browser Firmware Mode Release Handoff",
    "Status: NOT READY",
    "Branch: feature/firmware-mode",
    "Commit: abc1234 (abc123456789abcdef0123456789abcdef012345)",
    "Summary: 3 blocker(s), 2 warning(s)",
    "| BLOCKER | OAuth client id env |",
    "export VITE_GITHUB_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'",
    "### BLOCKER external E2E evidence",
    "source /tmp/browser-firmware-e2e.env",
    "npm run check:browser-firmware:release-status -- --json --e2e-report path/to/report.json",
    "BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID='<GitHub OAuth App client id>' npm run check:browser-firmware:public-release",
    "Do not paste GitHub tokens",
  ]) {
    if (!markdown.includes(expected)) {
      process.stdout.write(markdown);
      throw new Error(`Expected handoff to include: ${expected}`);
    }
  }
  for (const unexpected of ["release-status-token", "preflight-client", "ghp_"]) {
    if (markdown.includes(unexpected)) {
      process.stdout.write(markdown);
      throw new Error(`Expected handoff to avoid secret-like text: ${unexpected}`);
    }
  }
}

function createStatusFixture() {
  return {
    ready: false,
    headSha: "abc123456789abcdef0123456789abcdef012345",
    shortHead: "abc1234",
    branch: "feature/firmware-mode",
    productionUrl: "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware",
    blockerCount: 3,
    warningCount: 2,
    nextActions: [
      {
        name: "OAuth client id env",
        status: "blocker",
        action: "Set BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID and VITE_GITHUB_OAUTH_CLIENT_ID to the same public GitHub OAuth App client id locally, or configure the VITE_GITHUB_OAUTH_CLIENT_ID repository secret.",
        commands: [
          "export VITE_GITHUB_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'",
          "export BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'",
        ],
      },
      {
        name: "external E2E evidence",
        status: "blocker",
        action: "Generate an external E2E env template, fill it, then collect the report after real left/right flash verification.",
        commands: [
          "npm run collect:browser-firmware:e2e-report -- --print-env-template > /tmp/browser-firmware-e2e.env",
          "source /tmp/browser-firmware-e2e.env",
          "npm run collect:browser-firmware:e2e-report -- --out path/to/report.json --run-ui-smoke",
          "npm run check:browser-firmware:release-status -- --json --e2e-report path/to/report.json",
        ],
      },
    ],
    checks: [
      { name: "current git HEAD", status: "pass", detail: "abc1234 on feature/firmware-mode" },
      { name: "OAuth client id env", status: "blocker", detail: "BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID is missing" },
      { name: "Cloudflare token env", status: "warn", detail: "CLOUDFLARE_API_TOKEN is not set" },
      { name: "GitHub Actions release gate", status: "pass", detail: "push run 123 completed with Browser firmware release gates=success" },
    ],
  };
}
