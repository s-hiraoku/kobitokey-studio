import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "browser-firmware-release-bundle-"));

try {
  const statusPath = join(dir, "release-status.json");
  const outDir = join(dir, "bundle");
  writeFileSync(statusPath, JSON.stringify(createStatusFixture(), null, 2));

  const result = runBundle(["--status-json", statusPath, "--out-dir", outDir], {
    BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID: "bundle-oauth-client",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.stdout.write(result.stdout);
    throw new Error("Expected release bundle writer to pass");
  }
  if (!result.stdout.includes("OK wrote browser Firmware Mode release bundle")) {
    process.stdout.write(result.stdout);
    throw new Error("Expected release bundle writer to report output directory");
  }

  const statusJson = readFileSync(join(outDir, "release-status.json"), "utf8");
  const handoff = readFileSync(join(outDir, "release-handoff.md"), "utf8");
  const envTemplate = readFileSync(join(outDir, "browser-firmware-e2e.env"), "utf8");
  const readme = readFileSync(join(outDir, "README.md"), "utf8");

  assertIncludes(statusJson, '"ready": false');
  assertIncludes(statusJson, '"headSha": "abc123456789abcdef0123456789abcdef012345"');

  for (const expected of [
    "# Browser Firmware Mode Release Handoff",
    "Status: NOT READY",
    "Commit: abc1234 (abc123456789abcdef0123456789abcdef012345)",
    "BROWSER_FIRMWARE_E2E_CI_RUN_URL='https://github.com/s-hiraoku/kobitokey-studio/actions/runs/123'",
    "npm run check:browser-firmware:public-release -- --e2e-report path/to/report.json",
  ]) {
    assertIncludes(handoff, expected);
  }

  for (const expected of [
    "# Browser Firmware Mode external E2E evidence environment.",
    "export BROWSER_FIRMWARE_E2E_PRODUCTION_URL='https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware'",
    "export BROWSER_FIRMWARE_E2E_OAUTH_CLIENT_ID='bundle-oauth-client'",
    "export BROWSER_FIRMWARE_E2E_CI_RUN_URL='https://github.com/s-hiraoku/kobitokey-studio/actions/runs/123'",
    "export BROWSER_FIRMWARE_E2E_APP_COMMIT_SHA='abc123456789abcdef0123456789abcdef012345'",
    "export BROWSER_FIRMWARE_E2E_BRANCH='<firmware repository branch used by Commit & Build>'",
    "export BROWSER_FIRMWARE_E2E_RUN_UI_SMOKE='true'",
  ]) {
    assertIncludes(envTemplate, expected);
  }

  for (const expected of [
    "# Browser Firmware Mode Release Bundle",
    "source browser-firmware-e2e.env",
    "npm run collect:browser-firmware:e2e-report -- --out path/to/browser-firmware-e2e-report.json --run-ui-smoke",
    "npm run check:browser-firmware:release-status -- --json --e2e-report path/to/browser-firmware-e2e-report.json",
    "npm run check:browser-firmware:public-release -- --e2e-report path/to/browser-firmware-e2e-report.json",
    "Do not write GitHub tokens",
  ]) {
    assertIncludes(readme, expected);
  }

  const combined = `${statusJson}\n${handoff}\n${envTemplate}\n${readme}`;
  for (const unexpected of ["release-status-token", "preflight-client", "ghp_"]) {
    if (combined.includes(unexpected)) {
      throw new Error(`Expected release bundle to avoid secret-like text: ${unexpected}`);
    }
  }

  const help = runBundle(["--help"]);
  if (
    help.status !== 0 ||
    !help.stdout.includes("--status-json <release-status.json>") ||
    !help.stdout.includes("--out-dir <dir>") ||
    !help.stdout.includes("browser-firmware-e2e.env")
  ) {
    process.stdout.write(help.stdout);
    process.stderr.write(help.stderr);
    throw new Error("Expected release bundle help to document options and generated files");
  }

  console.log("OK browser firmware release bundle self-test passed");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

function runBundle(args, extraEnv = {}) {
  return spawnSync(process.execPath, ["scripts/write-browser-firmware-release-bundle.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
}

function assertIncludes(value, expected) {
  if (!value.includes(expected)) {
    process.stdout.write(value);
    throw new Error(`Expected output to include: ${expected}`);
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
        name: "external E2E evidence",
        status: "blocker",
        action: "Generate an external E2E env template, fill it, then collect the report after real left/right flash verification.",
        commands: [
          "npm run collect:browser-firmware:e2e-report -- --print-env-template > /tmp/browser-firmware-e2e.env",
          "source /tmp/browser-firmware-e2e.env",
          "npm run collect:browser-firmware:e2e-report -- --out path/to/report.json --run-ui-smoke",
          "npm run check:browser-firmware:release-status -- --json --e2e-report path/to/report.json",
          "VITE_GITHUB_OAUTH_CLIENT_ID='<GitHub OAuth App client id>' BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID='<GitHub OAuth App client id>' npm run check:browser-firmware:public-release -- --e2e-report path/to/report.json",
        ],
        links: [
          { label: "Production URL", url: "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware" },
          {
            label: "Release Plan",
            url: "https://github.com/s-hiraoku/kobitokey-studio/blob/feature/firmware-mode/docs/browser-firmware-release-plan.md",
          },
        ],
      },
    ],
    checks: [
      { name: "current git HEAD", status: "pass", detail: "abc1234 on feature/firmware-mode" },
      {
        name: "GitHub Actions release gate",
        status: "pass",
        detail: "pull_request run 123 completed with Browser firmware release gates=success",
        links: [{ label: "Release Gate Run", url: "https://github.com/s-hiraoku/kobitokey-studio/actions/runs/123" }],
      },
      { name: "external E2E evidence", status: "blocker", detail: "--e2e-report is required" },
    ],
  };
}
