import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: node scripts/write-browser-firmware-release-bundle.mjs [production-url] [--e2e-report <report.json>] [--out-dir <dir>]
       node scripts/write-browser-firmware-release-bundle.mjs --status-json <release-status.json> [--out-dir <dir>]

Writes a browser Firmware Mode release bundle for final QA handoff.

The bundle contains:
  release-status.json
  release-handoff.md
  browser-firmware-e2e.env
  README.md

Options:
  --out-dir <dir>
    Output directory. Defaults to /tmp/browser-firmware-release-bundle.
  --status-json <release-status.json>
    Use an existing release-status JSON file instead of running release-status.
  --e2e-report <report.json>
    Passed through to release-status when --status-json is not used.`);
  process.exit(0);
}

const outDir = readOption("--out-dir") || join(tmpdir(), "browser-firmware-release-bundle");
const statusJsonPath = readOption("--status-json");
const status = statusJsonPath ? readStatusJson(statusJsonPath) : collectReleaseStatus();
const releaseGateRunUrl = releaseGateRunUrlFor(status);
const statusOutPath = join(outDir, "release-status.json");
const handoffOutPath = join(outDir, "release-handoff.md");
const envOutPath = join(outDir, "browser-firmware-e2e.env");
const readmeOutPath = join(outDir, "README.md");

mkdirSync(outDir, { recursive: true });
writeFileSync(statusOutPath, `${JSON.stringify(status, null, 2)}\n`);
writeFileSync(handoffOutPath, renderHandoff(statusOutPath));
writeFileSync(envOutPath, renderEnvTemplate(status, releaseGateRunUrl));
writeFileSync(readmeOutPath, renderReadme(status, releaseGateRunUrl));

console.log(`OK wrote browser Firmware Mode release bundle to ${outDir}`);
console.log(`- ${statusOutPath}`);
console.log(`- ${handoffOutPath}`);
console.log(`- ${envOutPath}`);
console.log(`- ${readmeOutPath}`);

function readOption(name) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : "";
}

function passthroughArgs() {
  const filtered = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--out-dir" || arg === "--status-json") {
      index += 1;
      continue;
    }
    filtered.push(arg);
  }
  return filtered;
}

function readStatusJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`Failed to read release-status JSON: ${formatError(error)}`);
    process.exit(1);
  }
}

function collectReleaseStatus() {
  const statusArgs = passthroughArgs();
  if (!statusArgs.includes("--json")) {
    statusArgs.push("--json");
  }
  const result = spawnSync(process.execPath, ["scripts/check-browser-firmware-release-status.mjs", ...statusArgs], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = result.stdout.trim();
  if (!output) {
    process.stderr.write(result.stderr || "");
    process.exit(result.status ?? 1);
  }
  try {
    return JSON.parse(output);
  } catch (error) {
    process.stderr.write(result.stderr || "");
    console.error(`Failed to parse release-status JSON: ${formatError(error)}`);
    process.exit(1);
  }
}

function renderHandoff(statusPath) {
  const result = spawnSync(process.execPath, [
    "scripts/write-browser-firmware-release-handoff.mjs",
    "--status-json",
    statusPath,
  ], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "");
    process.stdout.write(result.stdout || "");
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

function renderEnvTemplate(status, releaseGateRunUrl) {
  const env = {
    ...process.env,
    BROWSER_FIRMWARE_E2E_PRODUCTION_URL:
      status.productionUrl || "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware",
    BROWSER_FIRMWARE_E2E_CI_RUN_URL:
      releaseGateRunUrl || "https://github.com/s-hiraoku/kobitokey-studio/actions/runs/<release-gate-run-id>",
    BROWSER_FIRMWARE_E2E_APP_COMMIT_SHA: status.headSha || "<kobitokey-studio-app-commit-sha>",
  };
  const result = spawnSync(process.execPath, [
    "scripts/collect-browser-firmware-e2e-evidence.mjs",
    "--print-env-template",
  ], {
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "");
    process.stdout.write(result.stdout || "");
    process.exit(result.status ?? 1);
  }
  return result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`;
}

function renderReadme(status, releaseGateRunUrl) {
  const reportPath = "path/to/browser-firmware-e2e-report.json";
  const lines = [
    "# Browser Firmware Mode Release Bundle",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Status: ${status.ready ? "READY" : "NOT READY"}`,
    `Branch: ${status.branch || "(unknown)"}`,
    `Commit: ${status.shortHead || "(unknown)"}${status.headSha ? ` (${status.headSha})` : ""}`,
    `Production URL: ${status.productionUrl || "(unknown)"}`,
    releaseGateRunUrl ? `Release gate run: ${releaseGateRunUrl}` : "Release gate run: (not reported)",
    "",
    "## Files",
    "",
    "- `release-status.json`: machine-readable release status and next actions.",
    "- `release-handoff.md`: human-readable release handoff.",
    "- `browser-firmware-e2e.env`: prefilled external E2E environment template.",
    "",
    "## QA Flow",
    "",
    "```sh",
    "source browser-firmware-e2e.env",
    `npm run collect:browser-firmware:e2e-report -- --out ${reportPath} --run-ui-smoke`,
    `npm run check:browser-firmware:release-status -- --json --e2e-report ${reportPath}`,
    `VITE_GITHUB_OAUTH_CLIENT_ID='<GitHub OAuth App client id>' BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID='<GitHub OAuth App client id>' npm run check:browser-firmware:public-release -- --e2e-report ${reportPath}`,
    `npm run write:browser-firmware:release-handoff -- --e2e-report ${reportPath} --out /tmp/browser-firmware-release-handoff.md`,
    "```",
    "",
    "## Notes",
    "",
    "- Replace placeholders in `browser-firmware-e2e.env` before sourcing it.",
    "- Do not write GitHub tokens, OAuth device codes, or UF2 bytes into this bundle.",
    "- Treat public-release gate success as the publish decision.",
    "",
  ];
  return lines.join("\n");
}

function releaseGateRunUrlFor(status) {
  for (const item of [...(status.checks ?? []), ...(status.nextActions ?? [])]) {
    for (const link of item.links ?? []) {
      if (link?.label === "Release Gate Run" && link.url) {
        return link.url;
      }
    }
  }
  return "";
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
