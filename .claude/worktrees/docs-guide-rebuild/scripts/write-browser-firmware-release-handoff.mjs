import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: node scripts/write-browser-firmware-release-handoff.mjs [production-url] [--e2e-report <report.json>] [--out <handoff.md>]
       node scripts/write-browser-firmware-release-handoff.mjs --status-json <release-status.json> [--out <handoff.md>]

Writes a Markdown handoff from browser Firmware Mode release-status JSON.
Secrets are not printed; commands keep placeholder values.

Options:
  --out <handoff.md>
    Write Markdown to a file instead of stdout.
  --status-json <release-status.json>
    Render an existing release-status JSON file instead of running
    check-browser-firmware-release-status.mjs.
  --e2e-report <report.json>
    Passed through to release-status when --status-json is not used.`);
  process.exit(0);
}

const outPath = readOption("--out");
const statusJsonPath = readOption("--status-json");
const status = statusJsonPath ? readStatusJson(statusJsonPath) : collectReleaseStatus();
const markdown = renderHandoff(status);

if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, markdown);
  console.log(`OK wrote browser Firmware Mode release handoff to ${outPath}`);
} else {
  process.stdout.write(markdown);
}

function readOption(name) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : "";
}

function passthroughArgs() {
  const filtered = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--out" || arg === "--status-json") {
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

function renderHandoff(status) {
  const checks = Array.isArray(status.checks) ? status.checks : [];
  const nextActions = Array.isArray(status.nextActions) ? status.nextActions : [];
  const evidenceLinks = evidenceLinksFor(checks, nextActions);
  const releaseGateRunUrl = evidenceLinks.find((link) => link.label === "Release Gate Run")?.url || "";
  const publicEntryUrls = publicEntryUrlsFor(status.productionUrl);
  const lines = [
    "# Browser Firmware Mode Release Handoff",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Status: ${status.ready ? "READY" : "NOT READY"}`,
    `Branch: ${status.branch || "(unknown)"}`,
    `Commit: ${status.shortHead || "(unknown)"}${status.headSha ? ` (${status.headSha})` : ""}`,
    `Production URL: ${status.productionUrl || "(unknown)"}`,
    `Summary: ${Number(status.blockerCount ?? 0)} blocker(s), ${Number(status.warningCount ?? 0)} warning(s)`,
    "",
    "## Checks",
    "",
    "| Status | Check | Detail |",
    "| --- | --- | --- |",
    ...checks.map((check) => `| ${tableCell(statusLabel(check.status))} | ${tableCell(check.name)} | ${tableCell(check.detail)} |`),
    "",
    "## Evidence Links",
    "",
    ...(evidenceLinks.length > 0
      ? evidenceLinks.map((link) => `- [${link.label || "Link"}](${link.url})`)
      : ["No evidence links reported by release-status."]),
    "",
    "## E2E Env Seed",
    "",
    "Use this to print the external E2E env template with the current app commit and release-gate run prefilled:",
    "",
    "```sh",
    `BROWSER_FIRMWARE_E2E_PRODUCTION_URL=${shellQuote(status.productionUrl || "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware")} \\`,
    `BROWSER_FIRMWARE_E2E_CI_RUN_URL=${shellQuote(releaseGateRunUrl || "https://github.com/s-hiraoku/kobitokey-studio/actions/runs/<release-gate-run-id>")} \\`,
    `BROWSER_FIRMWARE_E2E_APP_COMMIT_SHA=${shellQuote(status.headSha || "<kobitokey-studio-app-commit-sha>")} \\`,
    "npm run collect:browser-firmware:e2e-report -- --print-env-template > /tmp/browser-firmware-e2e.env",
    "```",
    "",
    "## Next Actions",
    "",
  ];

  if (nextActions.length === 0) {
    lines.push("No remaining release actions reported by release-status.", "");
  } else {
    for (const action of nextActions) {
      lines.push(`### ${statusLabel(action.status)} ${action.name}`);
      lines.push("");
      lines.push(action.action || "(no action text)");
      if (Array.isArray(action.links) && action.links.length > 0) {
        lines.push("", ...action.links.map((link) => `- [${link.label || "Link"}](${link.url})`));
      }
      if (Array.isArray(action.commands) && action.commands.length > 0) {
        lines.push("", "```sh", ...action.commands, "```");
      }
      lines.push("");
    }
  }

  lines.push(
    "## External E2E Evidence Checklist",
    "",
    "The final evidence report must prove these user-visible release paths on the same production origin:",
    "",
    ...publicEntryUrls.map((url) => `- ${url}`),
    "",
    "The report must also include the GitHub commit created by Commit & Build, the matching workflow_dispatch run, the downloaded artifact names/IDs/sizes, left/right UF2 hashes, flash method, bootloader marker checks, confirmation prompt acceptance, keyboard-half checks, and ISO UTC flash timestamps. The right flash timestamp must be the same as or later than left, and verifiedAt must be the same as or later than both.",
    "",
    "Required report fields include `ui.publicEntryLinksPassed: true` and `ui.publicEntryUrls` with every URL above.",
    "",
  );

  lines.push(
    "## Final Gate",
    "",
    "Run this only after production deploy and external E2E evidence are complete. This gate also checks release-status ready=true with the same E2E report:",
    "",
    "```sh",
    "export VITE_GITHUB_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'",
    "export BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'",
    "npm run check:browser-firmware:public-release -- --e2e-report path/to/report.json",
    "```",
    "",
    "## Notes",
    "",
    "- Replace placeholder values before running commands.",
    "- Do not paste GitHub tokens, OAuth device codes, or UF2 bytes into this handoff.",
    "- Treat public-release gate success as the publish decision; it includes release-status `ready: true`.",
    "",
  );

  return `${lines.join("\n")}`;
}

function evidenceLinksFor(checks, nextActions) {
  const seen = new Set();
  const links = [];
  for (const item of [...checks, ...nextActions]) {
    for (const link of item.links ?? []) {
      if (!link?.url) {
        continue;
      }
      const label = link.label || item.name || "Link";
      const key = `${label}\n${link.url}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      links.push({ label, url: link.url });
    }
  }
  const releaseGateRunUrl = safeReleaseGateRunUrl(process.env.BROWSER_FIRMWARE_E2E_CI_RUN_URL);
  if (releaseGateRunUrl) {
    const key = `Release Gate Run\n${releaseGateRunUrl}`;
    if (!seen.has(key)) {
      links.push({ label: "Release Gate Run", url: releaseGateRunUrl });
    }
  }
  return links;
}

function publicEntryUrlsFor(productionUrl) {
  const fallbackOrigin = "https://kobitokey-studio.s-hiraoku.workers.dev";
  let origin = fallbackOrigin;
  try {
    if (productionUrl) {
      origin = new URL(productionUrl).origin;
    }
  } catch {
    origin = fallbackOrigin;
  }
  return [
    "/?mode=firmware",
    "/?mode=firmware&tab=combos",
    "/?mode=firmware&tab=trackball",
    "/?mode=firmware&tab=diff",
    "/?mode=firmware&tab=build",
    "/?mode=direct",
  ].map((path) => new URL(path, origin).href);
}

function statusLabel(status) {
  switch (status) {
    case "pass":
      return "PASS";
    case "warn":
      return "WARN";
    case "blocker":
      return "BLOCKER";
    default:
      return String(status || "UNKNOWN").toUpperCase();
  }
}

function tableCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function safeReleaseGateRunUrl(value) {
  const url = String(value || "").trim();
  return /^https:\/\/github\.com\/s-hiraoku\/kobitokey-studio\/actions\/runs\/\d+$/.test(url) ? url : "";
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
