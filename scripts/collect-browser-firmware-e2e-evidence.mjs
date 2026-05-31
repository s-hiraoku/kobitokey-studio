import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { unzipSync } from "fflate";

const APP_REPOSITORY = "s-hiraoku/kobitokey-studio";
const APP_RELEASE_GATE_JOB_NAME = "Browser firmware release gates";
const UI_SMOKE_SCRIPT = "scripts/check-browser-firmware-ui-smoke.mjs";
const UI_SMOKE_COMMAND = "node scripts/check-browser-firmware-ui-smoke.mjs";
const PUBLIC_ENTRY_PATHS = [
  "/?mode=firmware",
  "/?mode=firmware&tab=combos",
  "/?mode=firmware&tab=trackball",
  "/?mode=firmware&tab=diff",
  "/?mode=firmware&tab=build",
  "/?mode=direct",
];
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  printUsage();
  process.exit(0);
}
if (args.includes("--print-env-template")) {
  printEnvTemplate();
  process.exit(0);
}

const outPath = readArg("--out");
const skipValidate = args.includes("--no-validate");
const runUiSmoke = args.includes("--run-ui-smoke") || readOptionalBooleanEnv("BROWSER_FIRMWARE_E2E_RUN_UI_SMOKE") === true;
const token = process.env.GITHUB_TOKEN || process.env.BROWSER_FIRMWARE_E2E_GITHUB_TOKEN || "";
const RELEASE_SECURITY_HEADERS = [
  { name: "Content-Security-Policy", header: "content-security-policy" },
  { name: "Strict-Transport-Security", header: "strict-transport-security" },
  { name: "Referrer-Policy", header: "referrer-policy", expected: "no-referrer" },
  { name: "X-Content-Type-Options", header: "x-content-type-options", expected: "nosniff" },
  { name: "X-Frame-Options", header: "x-frame-options", expected: "DENY" },
  { name: "Cross-Origin-Opener-Policy", header: "cross-origin-opener-policy", expected: "same-origin-allow-popups" },
  { name: "Cross-Origin-Resource-Policy", header: "cross-origin-resource-policy", expected: "same-origin" },
  { name: "Permissions-Policy", header: "permissions-policy" },
];

const productionUrl = requireEnv("BROWSER_FIRMWARE_E2E_PRODUCTION_URL");
const productionFetchUrl = process.env.BROWSER_FIRMWARE_E2E_PRODUCTION_FETCH_URL || productionUrl;
if (!skipValidate && !sameUrl(productionFetchUrl, productionUrl)) {
  throw new Error("BROWSER_FIRMWARE_E2E_PRODUCTION_FETCH_URL requires --no-validate and is only for collector tests");
}
const oauthClientId = requireEnv("BROWSER_FIRMWARE_E2E_OAUTH_CLIENT_ID");
const repository = requireEnv("BROWSER_FIRMWARE_E2E_REPOSITORY");
const branch = requireEnv("BROWSER_FIRMWARE_E2E_BRANCH");
const commitSha = requireEnv("BROWSER_FIRMWARE_E2E_COMMIT_SHA");
const runId = Number(requireEnv("BROWSER_FIRMWARE_E2E_RUN_ID"));
const leftUf2Path = requireEnv("BROWSER_FIRMWARE_E2E_LEFT_UF2");
const rightUf2Path = requireEnv("BROWSER_FIRMWARE_E2E_RIGHT_UF2");
const ciRunUrl = requireEnv("BROWSER_FIRMWARE_E2E_CI_RUN_URL");

const production = await collectProductionEvidence(productionUrl, productionFetchUrl, oauthClientId);
const appCommitSha = process.env.BROWSER_FIRMWARE_E2E_APP_COMMIT_SHA || production.appCommitSha || readGitHeadSha();
const appCiRunId = actionsRunIdFromUrl(ciRunUrl, APP_REPOSITORY);
const appCiRun = await fetchGitHubJson(`/repos/${APP_REPOSITORY}/actions/runs/${appCiRunId}`, token);
const appCiJobs = await fetchGitHubJson(`/repos/${APP_REPOSITORY}/actions/runs/${appCiRunId}/jobs`, token);
const appReleaseGateJob = collectSuccessfulReleaseGateJob(appCiJobs);
const commit = await fetchGitHubJson(`/repos/${repository}/commits/${commitSha}`, token);
const run = await fetchGitHubJson(`/repos/${repository}/actions/runs/${runId}`, token);
const actionsArtifacts = await fetchGitHubJson(`/repos/${repository}/actions/runs/${runId}/artifacts`, token);
const leftUf2 = hashFile(leftUf2Path);
const rightUf2 = hashFile(rightUf2Path);
const githubArtifacts = collectGitHubArtifactDetails(actionsArtifacts);
const artifactNames = githubArtifacts.map((artifact) => artifact.name);
const githubArtifactEntries = await collectGitHubArtifactEntries(repository, githubArtifacts, token);
const leftArtifactProof = artifactProofForUf2(githubArtifactEntries.uf2Files, leftUf2);
const rightArtifactProof = artifactProofForUf2(githubArtifactEntries.uf2Files, rightUf2);
requireArtifactProof(leftArtifactProof, "left", leftUf2);
requireArtifactProof(rightArtifactProof, "right", rightUf2);
const uiSmoke = runUiSmoke ? runProductionUiSmoke(productionUrl) : readManualUiSmoke(productionUrl);
const verifiedAt = new Date().toISOString();
const flashLeftCompletedAt = readFlashCompletedAtEnv("BROWSER_FIRMWARE_E2E_FLASH_LEFT_AT", verifiedAt);
const flashRightCompletedAt = readFlashCompletedAtEnv("BROWSER_FIRMWARE_E2E_FLASH_RIGHT_AT", verifiedAt);
requireFlashCompletedOrder(flashLeftCompletedAt, flashRightCompletedAt);

const report = {
  schemaVersion: 1,
  verifiedAt,
  tester: requireEnv("BROWSER_FIRMWARE_E2E_TESTER"),
  production,
  ci: {
    runUrl: ciRunUrl,
    runHeadSha: appCiRun.head_sha || "",
    status: appCiRun.status || "",
    conclusion: appCiRun.conclusion || "",
    appCommitSha,
    releaseGateJobName: appReleaseGateJob?.name || "",
    releaseGateJobConclusion: appReleaseGateJob?.conclusion || "",
    browserFirmwareReleaseCheckPassed: Boolean(appReleaseGateJob),
  },
  github: {
    repository,
    branch,
    oauthDeviceFlowVerified: readBooleanEnv("BROWSER_FIRMWARE_E2E_OAUTH_DEVICE_FLOW_VERIFIED"),
    oauthScopeVerified: readBooleanEnv("BROWSER_FIRMWARE_E2E_OAUTH_SCOPE_VERIFIED"),
    rateLimitBehaviorVerified: readBooleanEnv("BROWSER_FIRMWARE_E2E_RATE_LIMIT_VERIFIED"),
  },
  commit: {
    sha: commit.sha || commitSha,
    url: commit.html_url || `https://github.com/${repository}/commit/${commitSha}`,
    managedFiles: collectCommitFilenames(commit),
  },
  build: {
    runId,
    runUrl: run.html_url || `https://github.com/${repository}/actions/runs/${runId}`,
    headSha: run.head_sha || "",
    headBranch: run.head_branch || "",
    status: run.status || "",
    conclusion: run.conclusion || "",
    event: run.event || "",
    artifactDownloaded: artifactNames.length > 0,
    artifactNames,
    githubArtifacts,
    githubArtifactUf2Files: githubArtifactEntries.uf2Files,
    githubArtifactManifests: githubArtifactEntries.manifests,
    artifactsExpired: collectArtifactsExpired(githubArtifacts),
  },
  artifacts: {
    classificationSource: process.env.BROWSER_FIRMWARE_E2E_CLASSIFICATION_SOURCE || "manifest",
    left: {
      uf2Name: leftUf2.name,
      sha256: leftUf2.sha256,
      artifactId: leftArtifactProof?.artifactId,
      artifactName: leftArtifactProof?.artifactName,
    },
    right: {
      uf2Name: rightUf2.name,
      sha256: rightUf2.sha256,
      artifactId: rightArtifactProof?.artifactId,
      artifactName: rightArtifactProof?.artifactName,
    },
  },
  flash: {
    left: {
      completed: readBooleanEnv("BROWSER_FIRMWARE_E2E_FLASH_LEFT_COMPLETED"),
      method: readFlashMethodEnv("BROWSER_FIRMWARE_E2E_FLASH_LEFT_METHOD"),
      bootloaderMarkerChecked: readBooleanEnv("BROWSER_FIRMWARE_E2E_FLASH_LEFT_BOOTLOADER_MARKER_CHECKED"),
      confirmationPromptAccepted: readBooleanEnv("BROWSER_FIRMWARE_E2E_FLASH_LEFT_CONFIRMATION_ACCEPTED"),
      keyboardHalfChecked: readBooleanEnv("BROWSER_FIRMWARE_E2E_FLASH_LEFT_KEYBOARD_HALF_CHECKED"),
      uf2Name: leftUf2.name,
      completedAt: flashLeftCompletedAt,
    },
    right: {
      completed: readBooleanEnv("BROWSER_FIRMWARE_E2E_FLASH_RIGHT_COMPLETED"),
      method: readFlashMethodEnv("BROWSER_FIRMWARE_E2E_FLASH_RIGHT_METHOD"),
      bootloaderMarkerChecked: readBooleanEnv("BROWSER_FIRMWARE_E2E_FLASH_RIGHT_BOOTLOADER_MARKER_CHECKED"),
      confirmationPromptAccepted: readBooleanEnv("BROWSER_FIRMWARE_E2E_FLASH_RIGHT_CONFIRMATION_ACCEPTED"),
      keyboardHalfChecked: readBooleanEnv("BROWSER_FIRMWARE_E2E_FLASH_RIGHT_KEYBOARD_HALF_CHECKED"),
      uf2Name: rightUf2.name,
      completedAt: flashRightCompletedAt,
    },
  },
  persistence: {
    reloadRestoredProgress: readBooleanEnv("BROWSER_FIRMWARE_E2E_RELOAD_RESTORED_PROGRESS"),
    tokenStored: readBooleanEnv("BROWSER_FIRMWARE_E2E_TOKEN_STORED"),
    uf2BytesStored: readBooleanEnv("BROWSER_FIRMWARE_E2E_UF2_BYTES_STORED"),
  },
  ui: {
    ...uiSmoke,
    smokeCommand: runUiSmoke ? UI_SMOKE_COMMAND : readUiSmokeCommandEnv(),
    smokeViewportCount: Number(process.env.BROWSER_FIRMWARE_E2E_SMOKE_VIEWPORT_COUNT || 2),
  },
  notes: process.env.BROWSER_FIRMWARE_E2E_NOTES || "",
};

const reportJson = `${JSON.stringify(report, null, 2)}\n`;
if (outPath) {
  writeFileSync(outPath, reportJson);
} else {
  process.stdout.write(reportJson);
}

if (!skipValidate) {
  const tempDir = outPath ? "" : mkdtempSync(join(tmpdir(), "browser-firmware-evidence-"));
  const validationTarget = outPath || join(tempDir, "report.json");
  if (!outPath) {
    writeFileSync(validationTarget, reportJson);
  }
  try {
    const validation = spawnSync(process.execPath, ["scripts/check-browser-firmware-external-evidence.mjs", validationTarget], { encoding: "utf8" });
    if (validation.status !== 0) {
      process.stderr.write(validation.stderr);
      process.exit(validation.status ?? 1);
    }
  } finally {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
  process.stderr.write(`OK ${validationTarget} validated as browser firmware external E2E evidence\n`);
}

function printUsage() {
  console.log(`Usage: node scripts/collect-browser-firmware-e2e-evidence.mjs --out <report.json>
       node scripts/collect-browser-firmware-e2e-evidence.mjs --print-env-template

Required environment:
  BROWSER_FIRMWARE_E2E_PRODUCTION_URL
  BROWSER_FIRMWARE_E2E_OAUTH_CLIENT_ID
  BROWSER_FIRMWARE_E2E_TESTER
  BROWSER_FIRMWARE_E2E_CI_RUN_URL
  BROWSER_FIRMWARE_E2E_APP_COMMIT_SHA (optional when production metadata or git HEAD is available)
  BROWSER_FIRMWARE_E2E_REPOSITORY=owner/repo
  BROWSER_FIRMWARE_E2E_BRANCH
  BROWSER_FIRMWARE_E2E_COMMIT_SHA
  BROWSER_FIRMWARE_E2E_RUN_ID
  BROWSER_FIRMWARE_E2E_LEFT_UF2
  BROWSER_FIRMWARE_E2E_RIGHT_UF2
  BROWSER_FIRMWARE_E2E_FLASH_LEFT_AT
  BROWSER_FIRMWARE_E2E_FLASH_RIGHT_AT
  BROWSER_FIRMWARE_E2E_FLASH_LEFT_METHOD=direct-copy|download-copy
  BROWSER_FIRMWARE_E2E_FLASH_RIGHT_METHOD=direct-copy|download-copy
  Flash timestamps must be ISO UTC values; right must be the same as or later than left.

Boolean release confirmations:
  BROWSER_FIRMWARE_E2E_OAUTH_DEVICE_FLOW_VERIFIED=true
  BROWSER_FIRMWARE_E2E_OAUTH_SCOPE_VERIFIED=true
  BROWSER_FIRMWARE_E2E_RATE_LIMIT_VERIFIED=true
  BROWSER_FIRMWARE_E2E_FLASH_LEFT_COMPLETED=true
  BROWSER_FIRMWARE_E2E_FLASH_RIGHT_COMPLETED=true
  BROWSER_FIRMWARE_E2E_FLASH_LEFT_BOOTLOADER_MARKER_CHECKED=true
  BROWSER_FIRMWARE_E2E_FLASH_RIGHT_BOOTLOADER_MARKER_CHECKED=true
  BROWSER_FIRMWARE_E2E_FLASH_LEFT_CONFIRMATION_ACCEPTED=true
  BROWSER_FIRMWARE_E2E_FLASH_RIGHT_CONFIRMATION_ACCEPTED=true
  BROWSER_FIRMWARE_E2E_FLASH_LEFT_KEYBOARD_HALF_CHECKED=true
  BROWSER_FIRMWARE_E2E_FLASH_RIGHT_KEYBOARD_HALF_CHECKED=true
  BROWSER_FIRMWARE_E2E_RELOAD_RESTORED_PROGRESS=true
  BROWSER_FIRMWARE_E2E_TOKEN_STORED=false
  BROWSER_FIRMWARE_E2E_UF2_BYTES_STORED=false
  BROWSER_FIRMWARE_E2E_UI_SMOKE_PASSED=true
  BROWSER_FIRMWARE_E2E_TOKEN_NOT_STORED_IN_LOCAL_STORAGE=true
  BROWSER_FIRMWARE_E2E_TOKEN_CLEAR_WORKS=true
  BROWSER_FIRMWARE_E2E_BUTTON_LAYOUT_NO_OVERFLOW=true
  BROWSER_FIRMWARE_E2E_RIGHT_PANE_DEDUPLICATED=true
  BROWSER_FIRMWARE_E2E_LAYER_STRUCTURE_ACTIONS_PASSED=true
  BROWSER_FIRMWARE_E2E_REFERENCED_LAYER_DELETE_BLOCKED=true
  BROWSER_FIRMWARE_E2E_KEY_BINDING_EDIT_ACTIONS_PASSED=true
  BROWSER_FIRMWARE_E2E_COMBO_EDIT_ACTIONS_PASSED=true
  BROWSER_FIRMWARE_E2E_TRACKBALL_EDIT_ACTIONS_PASSED=true
  BROWSER_FIRMWARE_E2E_RELEASE_WIZARD_PRECONDITIONS_PASSED=true
  BROWSER_FIRMWARE_E2E_ARTIFACT_PROVENANCE_VISIBLE=true
  BROWSER_FIRMWARE_E2E_ARTIFACT_PROVENANCE_MATCHES_BUILD_ARTIFACTS=true
  BROWSER_FIRMWARE_E2E_PUBLIC_ENTRY_LINKS_PASSED=true
  BROWSER_FIRMWARE_E2E_PUBLIC_ENTRY_URLS='https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware,https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=combos,https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=trackball,https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=diff,https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=build,https://kobitokey-studio.s-hiraoku.workers.dev/?mode=direct'

Optional:
  GITHUB_TOKEN or BROWSER_FIRMWARE_E2E_GITHUB_TOKEN for private repositories
  BROWSER_FIRMWARE_E2E_PRODUCTION_FETCH_URL for collector tests with --no-validate
  BROWSER_FIRMWARE_E2E_GITHUB_API_BASE_URL for collector tests
  BROWSER_FIRMWARE_EXPECTED_PRODUCTION_ORIGIN for a future custom domain
  BROWSER_FIRMWARE_E2E_RUN_UI_SMOKE=true
  BROWSER_FIRMWARE_SMOKE_URL=https://kobitokey-studio.s-hiraoku.workers.dev
  BROWSER_FIRMWARE_E2E_CLASSIFICATION_SOURCE=manifest|filename
  BROWSER_FIRMWARE_E2E_UI_SMOKE_COMMAND="${UI_SMOKE_COMMAND}" or "npm run check:browser-firmware:ui"
  BROWSER_FIRMWARE_E2E_SMOKE_VIEWPORT_COUNT=2
  BROWSER_FIRMWARE_E2E_NOTES
  --print-env-template
  --run-ui-smoke
  --no-validate`);
}

function printEnvTemplate() {
  const productionUrl =
    process.env.BROWSER_FIRMWARE_E2E_PRODUCTION_URL?.trim() ||
    "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware";
  const ciRunUrl =
    process.env.BROWSER_FIRMWARE_E2E_CI_RUN_URL?.trim() ||
    "https://github.com/s-hiraoku/kobitokey-studio/actions/runs/<release-gate-run-id>";
  const currentHead =
    process.env.BROWSER_FIRMWARE_E2E_APP_COMMIT_SHA?.trim() ||
    readOptionalGitValue(["rev-parse", "HEAD"]) ||
    "<kobitokey-studio-app-commit-sha>";
  const oauthClientId =
    process.env.BROWSER_FIRMWARE_E2E_OAUTH_CLIENT_ID?.trim() ||
    process.env.BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID?.trim() ||
    process.env.VITE_GITHUB_OAUTH_CLIENT_ID?.trim() ||
    "<GitHub OAuth App client id>";
  const flashLeftCompletedAt =
    process.env.BROWSER_FIRMWARE_E2E_FLASH_LEFT_AT?.trim() || "<ISO timestamp after left flash>";
  const flashRightCompletedAt =
    process.env.BROWSER_FIRMWARE_E2E_FLASH_RIGHT_AT?.trim() || "<ISO timestamp after right flash>";
  const lines = [
    "# Browser Firmware Mode external E2E evidence environment.",
    "# Fill placeholders before running the collector. Do not commit this file.",
    `export BROWSER_FIRMWARE_E2E_PRODUCTION_URL=${shellQuote(productionUrl)}`,
    `export BROWSER_FIRMWARE_E2E_OAUTH_CLIENT_ID=${shellQuote(oauthClientId)}`,
    "export BROWSER_FIRMWARE_E2E_TESTER='<tester name>'",
    `export BROWSER_FIRMWARE_E2E_CI_RUN_URL=${shellQuote(ciRunUrl)}`,
    `export BROWSER_FIRMWARE_E2E_APP_COMMIT_SHA=${shellQuote(currentHead)}`,
    "export BROWSER_FIRMWARE_E2E_REPOSITORY='juichi50iii/KobitoKey_QWERTY'",
    "export BROWSER_FIRMWARE_E2E_BRANCH='<firmware repository branch used by Commit & Build>'",
    "export BROWSER_FIRMWARE_E2E_COMMIT_SHA='<firmware-repository-commit-sha-created-by-commit-build>'",
    "export BROWSER_FIRMWARE_E2E_RUN_ID='<firmware-build-actions-run-id>'",
    "export BROWSER_FIRMWARE_E2E_LEFT_UF2='<absolute path to left UF2>'",
    "export BROWSER_FIRMWARE_E2E_RIGHT_UF2='<absolute path to right UF2>'",
    "# Flash timestamps must be ISO UTC; right must be the same as or later than left.",
    `export BROWSER_FIRMWARE_E2E_FLASH_LEFT_AT=${shellQuote(flashLeftCompletedAt)}`,
    `export BROWSER_FIRMWARE_E2E_FLASH_RIGHT_AT=${shellQuote(flashRightCompletedAt)}`,
    "# To record each timestamp immediately after flashing, run the matching command then rerun the collector:",
    '# export BROWSER_FIRMWARE_E2E_FLASH_LEFT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"',
    '# export BROWSER_FIRMWARE_E2E_FLASH_RIGHT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"',
    "export BROWSER_FIRMWARE_E2E_FLASH_LEFT_METHOD='direct-copy'",
    "export BROWSER_FIRMWARE_E2E_FLASH_RIGHT_METHOD='direct-copy'",
    "export BROWSER_FIRMWARE_E2E_OAUTH_DEVICE_FLOW_VERIFIED='true'",
    "export BROWSER_FIRMWARE_E2E_OAUTH_SCOPE_VERIFIED='true'",
    "export BROWSER_FIRMWARE_E2E_RATE_LIMIT_VERIFIED='true'",
    "export BROWSER_FIRMWARE_E2E_FLASH_LEFT_COMPLETED='true'",
    "export BROWSER_FIRMWARE_E2E_FLASH_RIGHT_COMPLETED='true'",
    "export BROWSER_FIRMWARE_E2E_FLASH_LEFT_BOOTLOADER_MARKER_CHECKED='true'",
    "export BROWSER_FIRMWARE_E2E_FLASH_RIGHT_BOOTLOADER_MARKER_CHECKED='true'",
    "export BROWSER_FIRMWARE_E2E_FLASH_LEFT_CONFIRMATION_ACCEPTED='true'",
    "export BROWSER_FIRMWARE_E2E_FLASH_RIGHT_CONFIRMATION_ACCEPTED='true'",
    "export BROWSER_FIRMWARE_E2E_FLASH_LEFT_KEYBOARD_HALF_CHECKED='true'",
    "export BROWSER_FIRMWARE_E2E_FLASH_RIGHT_KEYBOARD_HALF_CHECKED='true'",
    "export BROWSER_FIRMWARE_E2E_RELOAD_RESTORED_PROGRESS='true'",
    "export BROWSER_FIRMWARE_E2E_TOKEN_STORED='false'",
    "export BROWSER_FIRMWARE_E2E_UF2_BYTES_STORED='false'",
    "export BROWSER_FIRMWARE_E2E_RUN_UI_SMOKE='true'",
    "# Required only when not using --run-ui-smoke or BROWSER_FIRMWARE_E2E_RUN_UI_SMOKE=true.",
    "export BROWSER_FIRMWARE_E2E_UI_SMOKE_PASSED='true'",
    "export BROWSER_FIRMWARE_E2E_TOKEN_NOT_STORED_IN_LOCAL_STORAGE='true'",
    "export BROWSER_FIRMWARE_E2E_TOKEN_CLEAR_WORKS='true'",
    "export BROWSER_FIRMWARE_E2E_BUTTON_LAYOUT_NO_OVERFLOW='true'",
    "export BROWSER_FIRMWARE_E2E_RIGHT_PANE_DEDUPLICATED='true'",
    "export BROWSER_FIRMWARE_E2E_LAYER_STRUCTURE_ACTIONS_PASSED='true'",
    "export BROWSER_FIRMWARE_E2E_REFERENCED_LAYER_DELETE_BLOCKED='true'",
    "export BROWSER_FIRMWARE_E2E_KEY_BINDING_EDIT_ACTIONS_PASSED='true'",
    "export BROWSER_FIRMWARE_E2E_COMBO_EDIT_ACTIONS_PASSED='true'",
    "export BROWSER_FIRMWARE_E2E_TRACKBALL_EDIT_ACTIONS_PASSED='true'",
    "export BROWSER_FIRMWARE_E2E_RELEASE_WIZARD_PRECONDITIONS_PASSED='true'",
    "export BROWSER_FIRMWARE_E2E_ARTIFACT_PROVENANCE_VISIBLE='true'",
    "export BROWSER_FIRMWARE_E2E_ARTIFACT_PROVENANCE_MATCHES_BUILD_ARTIFACTS='true'",
    "export BROWSER_FIRMWARE_E2E_PUBLIC_ENTRY_LINKS_PASSED='true'",
    "export BROWSER_FIRMWARE_E2E_PUBLIC_ENTRY_URLS='https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware,https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=combos,https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=trackball,https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=diff,https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=build,https://kobitokey-studio.s-hiraoku.workers.dev/?mode=direct'",
    "export BROWSER_FIRMWARE_E2E_NOTES='<optional QA notes without tokens or UF2 bytes>'",
    "",
    "# After filling placeholders, source this file and run:",
    "# source /tmp/browser-firmware-e2e.env",
    "# npm run collect:browser-firmware:e2e-report -- --out path/to/report.json --run-ui-smoke",
  ];
  console.log(lines.join("\n"));
}

function readManualUiSmoke(productionUrlForEntries) {
  return {
    buildAndFlashSmokePassed: readBooleanEnv("BROWSER_FIRMWARE_E2E_UI_SMOKE_PASSED"),
    tokenNotStoredInLocalStorage: readBooleanEnv("BROWSER_FIRMWARE_E2E_TOKEN_NOT_STORED_IN_LOCAL_STORAGE"),
    tokenClearWorks: readBooleanEnv("BROWSER_FIRMWARE_E2E_TOKEN_CLEAR_WORKS"),
    buttonLayoutNoOverflow: readBooleanEnv("BROWSER_FIRMWARE_E2E_BUTTON_LAYOUT_NO_OVERFLOW"),
    rightPaneDeduplicated: readBooleanEnv("BROWSER_FIRMWARE_E2E_RIGHT_PANE_DEDUPLICATED"),
    layerStructureActionsPassed: readBooleanEnv("BROWSER_FIRMWARE_E2E_LAYER_STRUCTURE_ACTIONS_PASSED"),
    referencedLayerDeleteBlocked: readBooleanEnv("BROWSER_FIRMWARE_E2E_REFERENCED_LAYER_DELETE_BLOCKED"),
    keyBindingEditActionsPassed: readBooleanEnv("BROWSER_FIRMWARE_E2E_KEY_BINDING_EDIT_ACTIONS_PASSED"),
    comboEditActionsPassed: readBooleanEnv("BROWSER_FIRMWARE_E2E_COMBO_EDIT_ACTIONS_PASSED"),
    trackballEditActionsPassed: readBooleanEnv("BROWSER_FIRMWARE_E2E_TRACKBALL_EDIT_ACTIONS_PASSED"),
    releaseWizardPreconditionsPassed: readBooleanEnv("BROWSER_FIRMWARE_E2E_RELEASE_WIZARD_PRECONDITIONS_PASSED"),
    artifactProvenanceVisible: readBooleanEnv("BROWSER_FIRMWARE_E2E_ARTIFACT_PROVENANCE_VISIBLE"),
    artifactProvenanceMatchesBuildArtifacts: readBooleanEnv("BROWSER_FIRMWARE_E2E_ARTIFACT_PROVENANCE_MATCHES_BUILD_ARTIFACTS"),
    publicEntryLinksPassed: readBooleanEnv("BROWSER_FIRMWARE_E2E_PUBLIC_ENTRY_LINKS_PASSED"),
    publicEntryUrls: readPublicEntryUrlsEnv(productionUrlForEntries),
  };
}

function runProductionUiSmoke(productionUrlForSmoke) {
  const smokeUrl = process.env.BROWSER_FIRMWARE_SMOKE_URL || productionUrlForSmoke;
  const smokeScript = process.env.BROWSER_FIRMWARE_E2E_UI_SMOKE_SCRIPT || UI_SMOKE_SCRIPT;
  const result = spawnSync(process.execPath, [smokeScript], {
    encoding: "utf8",
    env: {
      ...process.env,
      BROWSER_FIRMWARE_SMOKE_URL: smokeUrl,
    },
    stdio: "pipe",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`UI smoke failed for ${smokeUrl}`);
  }
  process.stderr.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  return {
    buildAndFlashSmokePassed: true,
    tokenNotStoredInLocalStorage: true,
    tokenClearWorks: true,
    buttonLayoutNoOverflow: true,
    rightPaneDeduplicated: true,
    layerStructureActionsPassed: true,
    referencedLayerDeleteBlocked: true,
    keyBindingEditActionsPassed: true,
    comboEditActionsPassed: true,
    trackballEditActionsPassed: true,
    releaseWizardPreconditionsPassed: true,
    artifactProvenanceVisible: true,
    artifactProvenanceMatchesBuildArtifacts: true,
    publicEntryLinksPassed: true,
    publicEntryUrls: publicEntryUrlsFor(productionUrlForSmoke),
  };
}

function readPublicEntryUrlsEnv(productionUrlForEntries) {
  const raw = process.env.BROWSER_FIRMWARE_E2E_PUBLIC_ENTRY_URLS;
  if (raw?.trim()) {
    return raw
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean);
  }
  return publicEntryUrlsFor(productionUrlForEntries);
}

function publicEntryUrlsFor(baseUrl) {
  const origin = new URL(baseUrl).origin;
  return PUBLIC_ENTRY_PATHS.map((path) => new URL(path, origin).href);
}

function readUiSmokeCommandEnv() {
  return process.env.BROWSER_FIRMWARE_E2E_UI_SMOKE_COMMAND?.trim() || "npm run check:browser-firmware:ui";
}

async function collectProductionEvidence(reportUrl, fetchUrl, oauthClientIdForDeviceFlow) {
  const production = new URL(fetchUrl);
  const response = await fetch(production);
  const headers = response.headers;
  if (!response.ok) {
    throw new Error(`Production URL returned ${response.status}: ${fetchUrl}`);
  }
  const pageSecurityHeaderIssues = collectReleaseSecurityHeaderIssues("Production URL", headers);
  if (pageSecurityHeaderIssues.length > 0) {
    throw new Error(`Production URL release security header check failed: ${pageSecurityHeaderIssues.join("; ")}`);
  }
  const pageHtml = await response.text();
  const releaseMetadata = await fetchReleaseMetadata(new URL("/api/release-metadata", production));

  return {
    url: reportUrl,
    fetchUrl,
    appCommitSha: releaseMetadata.appCommitSha,
    workerDeviceCodeRouteChecked: await checkWorkerRoute(new URL("/api/github/device-code", production)),
    workerAccessTokenRouteChecked: await checkWorkerRoute(new URL("/api/github/access-token", production)),
    workerUnsupportedScopeRejected: await checkUnsupportedOAuthScope(new URL("/api/github/device-code", production)),
    workerOAuthDeviceFlowStarted: await checkOAuthDeviceFlow(new URL("/api/github/device-code", production), oauthClientIdForDeviceFlow),
    frontendOAuthClientIdPresent: await checkFrontendOAuthClientId(production, pageHtml, oauthClientIdForDeviceFlow),
    workerArtifactRouteChecked: await checkArtifactRoute(new URL("/api/github/artifact-zip", production)),
    securityHeadersChecked:
      hasReleaseSecurityHeaders(headers),
    apiSecurityHeadersChecked: await checkApiSecurityHeaders([
      new URL("/api/github/device-code", production),
      new URL("/api/github/access-token", production),
      new URL("/api/github/artifact-zip", production),
    ]),
  };
}

async function fetchReleaseMetadata(url) {
  const response = await fetch(url);
  if (response.status !== 200) {
    throw new Error(`Release metadata route returned ${response.status}: ${url.href}`);
  }
  if (response.headers.get("cache-control") !== "no-store") {
    throw new Error(`Release metadata route is missing Cache-Control: no-store: ${url.href}`);
  }
  const metadataSecurityHeaderIssues = collectReleaseSecurityHeaderIssues("Release metadata route", response.headers);
  if (metadataSecurityHeaderIssues.length > 0) {
    throw new Error(`Release metadata route security header check failed: ${metadataSecurityHeaderIssues.join("; ")}`);
  }
  const body = await response.json().catch(() => null);
  if (body?.schemaVersion !== 1 || !isSha(body?.appCommitSha)) {
    throw new Error("Release metadata route did not return schemaVersion 1 with a 40-character appCommitSha");
  }
  return body;
}

async function checkFrontendOAuthClientId(pageUrl, pageHtml, clientId) {
  if (!clientId) return false;
  if (pageHtml.includes(clientId)) return true;
  const assetUrls = collectSameOriginAssetUrls(pageUrl, pageHtml);
  for (const assetUrl of assetUrls) {
    const response = await fetch(assetUrl).catch(() => null);
    if (!response?.ok) continue;
    const text = await response.text().catch(() => "");
    if (text.includes(clientId)) {
      return true;
    }
  }
  return false;
}

function collectSameOriginAssetUrls(pageUrl, pageHtml) {
  const urls = [];
  const seen = new Set();
  const assetPattern = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/gi;
  for (const match of pageHtml.matchAll(assetPattern)) {
    const assetUrl = toSameOriginUrl(pageUrl, match[1]);
    if (!assetUrl || seen.has(assetUrl)) continue;
    seen.add(assetUrl);
    urls.push(assetUrl);
  }
  return urls;
}

function toSameOriginUrl(pageUrl, value) {
  try {
    const url = new URL(value, pageUrl);
    return url.origin === pageUrl.origin ? url.toString() : null;
  } catch {
    return null;
  }
}

async function checkOAuthDeviceFlow(url, clientId) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, scope: "repo" }),
  });
  if (response.status !== 200 || response.headers.get("cache-control") !== "no-store") {
    return false;
  }
  if (!hasReleaseSecurityHeaders(response.headers)) {
    return false;
  }
  const body = await response.json().catch(() => null);
  return Boolean(body?.device_code && body?.user_code && body?.verification_uri && body?.expires_in);
}

async function checkWorkerRoute(url) {
  return checkInvalidJsonWorkerResponse(url, { requireReleaseSecurityHeaders: false });
}

async function checkArtifactRoute(url) {
  if (!(await checkWorkerRoute(url))) return false;
  return (
    (await checkJsonError(url, {
      body: { owner: "owner/name", repo: "repo", artifactId: 1, token: "release-check-token" },
      expectedError: "invalid_owner_or_repo",
    })) &&
    (await checkJsonError(url, {
      body: { owner: "owner", repo: "repo", artifactId: -1, token: "release-check-token" },
      expectedError: "invalid_artifact_id",
    }))
  );
}

async function checkJsonError(url, { body, expectedError }) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status !== 400 || response.headers.get("cache-control") !== "no-store") {
    return false;
  }
  const responseBody = await response.json().catch(() => null);
  return responseBody?.error === expectedError;
}

async function checkInvalidJsonWorkerResponse(url, { requireReleaseSecurityHeaders }) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  if (response.status !== 400 || response.headers.get("cache-control") !== "no-store") {
    return false;
  }
  if (requireReleaseSecurityHeaders && !hasReleaseSecurityHeaders(response.headers)) {
    return false;
  }
  const body = await response.json().catch(() => null);
  return body?.error === "invalid_json";
}

async function checkUnsupportedOAuthScope(url) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "browser-firmware-release-check", scope: "admin:org" }),
  });
  if (response.status !== 400 || response.headers.get("cache-control") !== "no-store") {
    return false;
  }
  const body = await response.json().catch(() => null);
  return body?.error === "unsupported_oauth_scope";
}

async function checkApiSecurityHeaders(urls) {
  const results = await Promise.all(
    urls.map((url) => checkInvalidJsonWorkerResponse(url, { requireReleaseSecurityHeaders: true })),
  );
  return results.every(Boolean);
}

function hasReleaseSecurityHeaders(headers) {
  return collectReleaseSecurityHeaderIssues("response", headers).length === 0;
}

function collectReleaseSecurityHeaderIssues(label, headers) {
  const headerIssues = [];
  for (const { name, header, expected } of RELEASE_SECURITY_HEADERS) {
    const actual = headers.get(header);
    if (!actual) {
      headerIssues.push(`${label} is missing ${name}`);
      continue;
    }
    if (expected && actual !== expected) {
      headerIssues.push(`${label} should return ${name}: ${expected} (got ${actual})`);
    }
  }
  return headerIssues;
}

function isSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

async function fetchGitHubJson(path, authToken) {
  const apiBaseUrl = process.env.BROWSER_FIRMWARE_E2E_GITHUB_API_BASE_URL || "https://api.github.com";
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "kobitokey-browser-firmware-release-check",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} returned ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function fetchGitHubBytes(path, authToken) {
  const apiBaseUrl = process.env.BROWSER_FIRMWARE_E2E_GITHUB_API_BASE_URL || "https://api.github.com";
  const response = await fetch(`${apiBaseUrl}${path}`, {
    redirect: "manual",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "kobitokey-browser-firmware-release-check",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`GitHub API ${path} returned ${response.status} without a redirect location`);
    }
    const redirectUrl = safeArtifactRedirectUrl(location, apiBaseUrl);
    const redirected = await fetch(redirectUrl, {
      headers: {
        "User-Agent": "kobitokey-browser-firmware-release-check",
      },
    });
    if (!redirected.ok) {
      throw new Error(`GitHub artifact redirect ${redirectUrl.href} returned ${redirected.status}: ${await redirected.text()}`);
    }
    return new Uint8Array(await redirected.arrayBuffer());
  }
  if (!response.ok) {
    throw new Error(`GitHub API ${path} returned ${response.status}: ${await response.text()}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function safeArtifactRedirectUrl(location, apiBaseUrl) {
  let url;
  try {
    url = new URL(location, apiBaseUrl);
  } catch {
    throw new Error("GitHub artifact redirect location is malformed");
  }
  if (!isSafeArtifactRedirectUrl(url)) {
    throw new Error(`GitHub artifact redirect location is unsafe: ${url.href}`);
  }
  return url;
}

function isSafeArtifactRedirectUrl(url) {
  if (url.protocol === "https:") {
    return true;
  }
  return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
}

function hashFile(path) {
  const bytes = readFileSync(path);
  return {
    name: basename(path),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function artifactProofForUf2(uf2Files, uf2) {
  if (!Array.isArray(uf2Files)) {
    return null;
  }
  return (
    uf2Files.find(
      (candidate) =>
        basename(candidate?.name ?? "") === uf2.name &&
        candidate?.sha256 === uf2.sha256 &&
        Number.isInteger(candidate?.artifactId) &&
        typeof candidate?.artifactName === "string",
    ) ?? null
  );
}

function requireArtifactProof(proof, side, uf2) {
  if (!proof) {
    throw new Error(
      `BROWSER_FIRMWARE_E2E_${side.toUpperCase()}_UF2 must match a UF2 entry from the GitHub artifact zip by basename and SHA-256: ${uf2.name}`,
    );
  }
}

function actionsRunIdFromUrl(value, repository) {
  try {
    const url = new URL(value);
    const [owner, repo] = repository.split("/");
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      parts[0] === owner &&
      parts[1] === repo &&
      parts[2] === "actions" &&
      parts[3] === "runs" &&
      /^[1-9]\d*$/.test(parts[4])
    ) {
      return Number(parts[4]);
    }
  } catch {
    // handled below
  }
  throw new Error(`BROWSER_FIRMWARE_E2E_CI_RUN_URL must point to ${repository} Actions run`);
}

function collectCommitFilenames(commit) {
  if (!Array.isArray(commit.files)) {
    throw new Error("GitHub commit response did not include files[]; cannot prove managed firmware file scope");
  }
  return commit.files.map((file) => file.filename).filter((filename) => typeof filename === "string");
}

function collectSuccessfulReleaseGateJob(response) {
  if (!Array.isArray(response?.jobs)) {
    throw new Error("KobitoKey Studio Actions jobs response did not include jobs[]; cannot prove release gates passed");
  }
  return (
    response.jobs.find(
      (job) =>
        job?.name === APP_RELEASE_GATE_JOB_NAME &&
        job?.status === "completed" &&
        job?.conclusion === "success",
    ) ?? null
  );
}

function collectGitHubArtifactDetails(response) {
  if (!Array.isArray(response.artifacts)) {
    throw new Error("GitHub Actions artifacts response did not include artifacts[]; cannot prove artifact availability");
  }
  return response.artifacts
    .map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      sizeInBytes: artifact.size_in_bytes,
      expired: artifact.expired === true,
    }))
    .filter((artifact) => typeof artifact.name === "string" && artifact.name.trim().length > 0);
}

async function collectGitHubArtifactEntries(repository, artifacts, authToken) {
  const uf2Files = [];
  const manifests = [];
  for (const artifact of artifacts.filter((candidate) => candidate.expired === false)) {
    const zipBytes = await fetchGitHubBytes(`/repos/${repository}/actions/artifacts/${artifact.id}/zip`, authToken);
    const entries = unzipSync(zipBytes);
    for (const [name, bytes] of Object.entries(entries)) {
      const lowerName = name.toLowerCase();
      if (lowerName.endsWith(".uf2")) {
        uf2Files.push({
          artifactId: artifact.id,
          artifactName: artifact.name,
          name,
          sizeInBytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      } else if (lowerName.endsWith("manifest.json") || lowerName.endsWith("firmware-manifest.json")) {
        const contents = new TextDecoder().decode(bytes);
        manifests.push({
          artifactId: artifact.id,
          artifactName: artifact.name,
          name,
          sizeInBytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          targets: targetsFromManifest(name, contents, Object.keys(entries).filter((entryName) => entryName.toLowerCase().endsWith(".uf2"))),
        });
      }
    }
  }
  return { manifests, uf2Files };
}

function targetsFromManifest(manifestName, contents, uf2Files) {
  let value;
  try {
    value = JSON.parse(contents);
  } catch {
    return { left: null, right: null };
  }
  if (!isRecord(value)) {
    return { left: null, right: null };
  }

  const baseDir = dirname(manifestName);
  let left = sideFileFromManifest(value, "left", baseDir, uf2Files);
  let right = sideFileFromManifest(value, "right", baseDir, uf2Files);
  if (Array.isArray(value.outputs)) {
    for (const output of value.outputs) {
      if (!isRecord(output) || typeof output.file !== "string") {
        continue;
      }
      const side = typeof output.side === "string" ? output.side.toLowerCase() : "";
      if (side === "left" && !left) {
        left = resolveManifestFile(baseDir, output.file, uf2Files);
      } else if (side === "right" && !right) {
        right = resolveManifestFile(baseDir, output.file, uf2Files);
      }
    }
  }
  return { left, right };
}

function sideFileFromManifest(value, side, baseDir, uf2Files) {
  const sideValue = value[side];
  if (typeof sideValue === "string") {
    return resolveManifestFile(baseDir, sideValue, uf2Files);
  }
  if (isRecord(sideValue) && typeof sideValue.file === "string") {
    return resolveManifestFile(baseDir, sideValue.file, uf2Files);
  }
  return null;
}

function resolveManifestFile(baseDir, file, uf2Files) {
  const normalizedFile = normalizePath(file);
  const relativePath = baseDir ? `${baseDir}/${normalizedFile}` : normalizedFile;
  const filename = basename(normalizedFile);
  return (
    uf2Files.find((candidate) => {
      const normalizedCandidate = normalizePath(candidate);
      return (
        normalizedCandidate === normalizedFile ||
        normalizedCandidate === relativePath ||
        normalizedCandidate.endsWith(`/${normalizedFile}`) ||
        basename(normalizedCandidate) === filename
      );
    }) ?? null
  );
}

function normalizePath(path) {
  return path.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function dirname(path) {
  const normalized = normalizePath(path);
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex === -1 ? "" : normalized.slice(0, slashIndex);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectArtifactsExpired(artifacts) {
  if (!Array.isArray(artifacts)) {
    throw new Error("GitHub Actions artifacts response did not include artifacts[]; cannot prove artifact expiry state");
  }
  return artifacts.some((artifact) => artifact.expired === true);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

function readBooleanEnv(name) {
  const value = process.env[name];
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`${name} must be true or false`);
}

function readFlashMethodEnv(name) {
  const value = requireEnv(name);
  if (value === "direct-copy" || value === "download-copy") {
    return value;
  }
  throw new Error(`${name} must be direct-copy or download-copy`);
}

function readFlashCompletedAtEnv(name, verifiedAtValue) {
  const value = requireEnv(name);
  if (!isIsoTimestamp(value)) {
    throw new Error(`${name} must be an ISO timestamp`);
  }
  if (Date.parse(value) > Date.parse(verifiedAtValue)) {
    throw new Error(`${name} must be the same as or before evidence collection time`);
  }
  return value;
}

function requireFlashCompletedOrder(leftCompletedAt, rightCompletedAt) {
  if (Date.parse(rightCompletedAt) < Date.parse(leftCompletedAt)) {
    throw new Error("BROWSER_FIRMWARE_E2E_FLASH_RIGHT_AT must be the same as or later than BROWSER_FIRMWARE_E2E_FLASH_LEFT_AT");
  }
}

function isIsoTimestamp(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && !Number.isNaN(Date.parse(value));
}

function sameUrl(left, right) {
  try {
    return new URL(left).href === new URL(right).href;
  } catch {
    return left === right;
  }
}

function readOptionalBooleanEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return undefined;
  }
  return readBooleanEnv(name);
}

function readGitHeadSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error("BROWSER_FIRMWARE_E2E_APP_COMMIT_SHA is required when git HEAD cannot be read");
  }
  return result.stdout.trim();
}

function readOptionalGitValue(gitArgs) {
  const result = spawnSync("git", gitArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
