import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const templateReport = "docs/browser-firmware-e2e-evidence.template.json";
const dir = mkdtempSync(join(tmpdir(), "browser-firmware-public-release-"));

try {
  const previewReport = join(dir, "preview.json");
  writeFileSync(previewReport, JSON.stringify(createPreviewReport(), null, 2));

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
    { BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID: "dummy-client" },
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
    },
  );
  expectFailure(
    mismatchedEnvironmentUrl,
    ["BROWSER_FIRMWARE_PRODUCTION_URL must match e2e report production.url"],
    "Expected public release gate to reject an environment URL that differs from report production.url",
  );

  const previewUrl = await runPublicRelease(
    ["--skip-merge-readiness", "--skip-current-head", "--e2e-report", previewReport],
    { BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID: "dummy-client" },
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
    { BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID: "dummy-client" },
  );
  expectFailure(
    mismatchedHead,
    ["e2e report ci.appCommitSha must match the current git HEAD"],
    "Expected public release gate to reject E2E evidence from a different commit",
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

function runPublicRelease(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/check-browser-firmware-public-release.mjs", ...args], {
      cwd: process.cwd(),
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

function createPreviewReport() {
  const report = JSON.parse(readFileSync(templateReport, "utf8"));
  report.production.url = "https://feature-firmware-mode-kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware";
  return report;
}
