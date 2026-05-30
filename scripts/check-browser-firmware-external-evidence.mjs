import { readFileSync } from "node:fs";
import { basename } from "node:path";

const DEFAULT_EXPECTED_PRODUCTION_ORIGIN = "https://kobitokey-studio.s-hiraoku.workers.dev";
const expectedProductionOrigin =
  process.env.BROWSER_FIRMWARE_EXPECTED_PRODUCTION_ORIGIN?.trim() || DEFAULT_EXPECTED_PRODUCTION_ORIGIN;
const reportPath = process.argv[2];

if (!reportPath || reportPath === "--help" || reportPath === "-h") {
  console.error("Usage: node scripts/check-browser-firmware-external-evidence.mjs <evidence-report.json>");
  console.error("Template: docs/browser-firmware-e2e-evidence.template.json");
  process.exit(reportPath ? 0 : 1);
}

const report = readJson(reportPath);
const issues = [];

requireValue(report.schemaVersion === 1, "schemaVersion must be 1");
requireIsoTimestamp(report.verifiedAt, "verifiedAt must be an ISO timestamp");
requireNonPlaceholderString(report.tester, "tester is required");

requireHttpsUrl(report.production?.url, "production.url must be an https URL");
requireNoPlaceholderUrl(report.production?.url, "production.url must not be a placeholder URL");
requireFirmwareModeUrl(report.production?.url, "production.url must open browser Firmware Mode with mode=firmware");
requireExpectedProductionOrigin(report.production?.url, "production.url must use the expected public production origin");
requireHttpsUrl(report.production?.fetchUrl, "production.fetchUrl must be an https URL");
requireValue(report.production?.fetchUrl === report.production?.url, "production.fetchUrl must match production.url for public release evidence");
requireValue(report.production?.workerDeviceCodeRouteChecked === true, "production.workerDeviceCodeRouteChecked must be true");
requireValue(report.production?.workerAccessTokenRouteChecked === true, "production.workerAccessTokenRouteChecked must be true");
requireValue(report.production?.workerUnsupportedScopeRejected === true, "production.workerUnsupportedScopeRejected must be true");
requireValue(report.production?.workerOAuthDeviceFlowStarted === true, "production.workerOAuthDeviceFlowStarted must be true");
requireValue(report.production?.frontendOAuthClientIdPresent === true, "production.frontendOAuthClientIdPresent must be true");
requireValue(report.production?.workerArtifactRouteChecked === true, "production.workerArtifactRouteChecked must be true");
requireValue(report.production?.securityHeadersChecked === true, "production.securityHeadersChecked must be true");
requireValue(report.production?.apiSecurityHeadersChecked === true, "production.apiSecurityHeadersChecked must be true");

requireHttpsUrl(report.ci?.runUrl, "ci.runUrl must be an https URL");
requireSha(report.ci?.appCommitSha, "ci.appCommitSha must be a 40-character SHA");
requireNonPlaceholderHash(report.ci?.appCommitSha, "ci.appCommitSha must not be a placeholder SHA");
requireValue(report.ci?.browserFirmwareReleaseCheckPassed === true, "ci.browserFirmwareReleaseCheckPassed must be true");

requireValue(isRepoSlug(report.github?.repository), "github.repository must be owner/repo");
requireValue(report.github?.repository !== "owner/repo", "github.repository must not be the template owner/repo placeholder");
requireNonEmptyString(report.github?.branch, "github.branch is required");
requireValue(report.github?.oauthDeviceFlowVerified === true, "github.oauthDeviceFlowVerified must be true");
requireValue(report.github?.oauthScopeVerified === true, "github.oauthScopeVerified must be true");
requireValue(report.github?.rateLimitBehaviorVerified === true, "github.rateLimitBehaviorVerified must be true");

const commitSha = report.commit?.sha;
requireSha(commitSha, "commit.sha must be a 40-character SHA");
requireNonPlaceholderHash(commitSha, "commit.sha must not be a placeholder SHA");
requireHttpsUrl(report.commit?.url, "commit.url must be an https URL");
requireValue(
  isGitHubPath(report.commit?.url, report.github?.repository, ["commit", commitSha]),
  "commit.url must point to github.repository and commit.sha",
);
requireManagedFiles(report.commit?.managedFiles);

requirePositiveInteger(report.build?.runId, "build.runId must be a positive integer");
requireHttpsUrl(report.build?.runUrl, "build.runUrl must be an https URL");
requireValue(
  isGitHubPath(report.build?.runUrl, report.github?.repository, ["actions", "runs", String(report.build?.runId)]),
  "build.runUrl must point to github.repository and build.runId",
);
requireSha(report.build?.headSha, "build.headSha must be a 40-character SHA");
requireNonPlaceholderHash(report.build?.headSha, "build.headSha must not be a placeholder SHA");
requireValue(report.build?.headSha === commitSha, "build.headSha must match commit.sha");
requireNonEmptyString(report.build?.headBranch, "build.headBranch is required");
requireValue(report.build?.headBranch === report.github?.branch, "build.headBranch must match github.branch");
requireValue(report.build?.status === "completed", "build.status must be completed");
requireValue(report.build?.conclusion === "success", "build.conclusion must be success");
requireValue(report.build?.event === "workflow_dispatch", "build.event must be workflow_dispatch");
requireValue(report.build?.artifactDownloaded === true, "build.artifactDownloaded must be true");
requireArtifactNames(report.build?.artifactNames);
requireGitHubArtifacts(report.build?.githubArtifacts, report.build?.artifactNames);
const githubArtifactUf2Files = requireGitHubArtifactUf2Files(report.build?.githubArtifactUf2Files, report.build?.githubArtifacts);
const githubArtifactManifests = requireGitHubArtifactManifests(report.build?.githubArtifactManifests, report.build?.githubArtifacts);
requireValue(report.build?.artifactsExpired === false, "build.artifactsExpired must be false");

requireArtifactSide(report.artifacts?.left, "left");
requireArtifactSide(report.artifacts?.right, "right");
requireArtifactUf2Proof(githubArtifactUf2Files, report.artifacts?.left, "left");
requireArtifactUf2Proof(githubArtifactUf2Files, report.artifacts?.right, "right");
if (report.artifacts?.left?.uf2Name && report.artifacts?.right?.uf2Name) {
  requireValue(report.artifacts.left.uf2Name !== report.artifacts.right.uf2Name, "left and right artifact UF2 names must differ");
  requireValue(
    artifactBasename(report.artifacts.left.uf2Name) !== artifactBasename(report.artifacts.right.uf2Name),
    "left and right artifact UF2 basenames must differ",
  );
}
if (report.artifacts?.left?.sha256 && report.artifacts?.right?.sha256) {
  requireValue(report.artifacts.left.sha256 !== report.artifacts.right.sha256, "left and right artifact SHA-256 values must differ");
}
requireValue(
  report.artifacts?.classificationSource === "manifest" || report.artifacts?.classificationSource === "filename",
  "artifacts.classificationSource must be manifest or filename",
);
requireClassificationProof(report.artifacts, githubArtifactManifests);

requireFlashSide(report.flash?.left, "left", report.artifacts?.left?.uf2Name);
requireFlashSide(report.flash?.right, "right", report.artifacts?.right?.uf2Name);
requireValue(
  !isIsoTimestamp(report.flash?.left?.completedAt) ||
    !isIsoTimestamp(report.flash?.right?.completedAt) ||
    Date.parse(report.flash.left.completedAt) <= Date.parse(report.flash.right.completedAt),
  "flash.right.completedAt must be the same as or later than flash.left.completedAt",
);

requireValue(report.persistence?.reloadRestoredProgress === true, "persistence.reloadRestoredProgress must be true");
requireValue(report.persistence?.tokenStored === false, "persistence.tokenStored must be false");
requireValue(report.persistence?.uf2BytesStored === false, "persistence.uf2BytesStored must be false");

requireValue(report.ui?.buildAndFlashSmokePassed === true, "ui.buildAndFlashSmokePassed must be true");
requireValue(report.ui?.tokenNotStoredInLocalStorage === true, "ui.tokenNotStoredInLocalStorage must be true");
requireValue(report.ui?.tokenClearWorks === true, "ui.tokenClearWorks must be true");
requireValue(report.ui?.buttonLayoutNoOverflow === true, "ui.buttonLayoutNoOverflow must be true");
requireValue(report.ui?.rightPaneDeduplicated === true, "ui.rightPaneDeduplicated must be true");
requireValue(report.ui?.layerStructureActionsPassed === true, "ui.layerStructureActionsPassed must be true");
requireValue(report.ui?.referencedLayerDeleteBlocked === true, "ui.referencedLayerDeleteBlocked must be true");
requireValue(report.ui?.keyBindingEditActionsPassed === true, "ui.keyBindingEditActionsPassed must be true");
requireValue(report.ui?.comboEditActionsPassed === true, "ui.comboEditActionsPassed must be true");
requireValue(report.ui?.trackballEditActionsPassed === true, "ui.trackballEditActionsPassed must be true");
requireValue(report.ui?.releaseWizardPreconditionsPassed === true, "ui.releaseWizardPreconditionsPassed must be true");
requireValue(report.ui?.smokeCommand === "npm run check:browser-firmware:ui", "ui.smokeCommand must be npm run check:browser-firmware:ui");
requireValue(Number.isInteger(report.ui?.smokeViewportCount) && report.ui.smokeViewportCount >= 2, "ui.smokeViewportCount must be at least 2");

if (issues.length > 0) {
  console.error(`${basename(reportPath)} is not ready for browser firmware release:`);
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(`OK ${basename(reportPath)} satisfies browser firmware external release evidence gates`);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`Failed to read JSON report: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

function requireValue(condition, message) {
  if (!condition) {
    issues.push(message);
  }
}

function requireNonEmptyString(value, message) {
  requireValue(typeof value === "string" && value.trim().length > 0, message);
}

function requireNonPlaceholderString(value, message) {
  requireValue(typeof value === "string" && value.trim().length > 0 && !/^todo|tbd|placeholder$/i.test(value.trim()), message);
}

function requireHttpsUrl(value, message) {
  requireValue(typeof value === "string" && /^https:\/\/\S+$/.test(value), message);
}

function requireNoPlaceholderUrl(value, message) {
  requireValue(typeof value === "string" && !/^https:\/\/(?:example\.com|example\.org|example\.net)(?:\/|$)/.test(value), message);
}

function requireFirmwareModeUrl(value, message) {
  let ok = false;
  if (typeof value === "string") {
    try {
      ok = new URL(value).searchParams.get("mode") === "firmware";
    } catch {
      ok = false;
    }
  }
  requireValue(ok, message);
}

function requireExpectedProductionOrigin(value, message) {
  let ok = false;
  try {
    ok = typeof value === "string" && new URL(value).origin === new URL(expectedProductionOrigin).origin;
  } catch {
    ok = false;
  }
  requireValue(ok, message);
}

function requireSha(value, message) {
  requireValue(typeof value === "string" && /^[0-9a-f]{40}$/i.test(value), message);
}

function requireSha256(value, message) {
  requireValue(typeof value === "string" && /^[0-9a-f]{64}$/i.test(value), message);
}

function requireNonPlaceholderHash(value, message) {
  requireValue(typeof value === "string" && new Set(value.toLowerCase()).size > 1, message);
}

function requireIsoTimestamp(value, message) {
  requireValue(isIsoTimestamp(value), message);
}

function isIsoTimestamp(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && !Number.isNaN(Date.parse(value));
}

function requirePositiveInteger(value, message) {
  requireValue(Number.isInteger(value) && value > 0, message);
}

function isRepoSlug(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function isGitHubPath(value, repository, suffix) {
  if (typeof value !== "string" || !isRepoSlug(repository)) {
    return false;
  }
  try {
    const url = new URL(value);
    const [owner, repo] = repository.split("/");
    const expected = ["", owner, repo, ...suffix].map(String);
    return url.protocol === "https:" && url.hostname === "github.com" && url.pathname === expected.join("/");
  } catch {
    return false;
  }
}

function requireManagedFiles(value) {
  const expected = [
    "config/KobitoKey.keymap",
    "config/boards/shields/KobitoKey/KobitoKey_left.overlay",
    "config/boards/shields/KobitoKey/KobitoKey_right.overlay",
  ];
  requireValue(Array.isArray(value), "commit.managedFiles must be an array");
  if (!Array.isArray(value)) {
    return;
  }
  for (const path of expected) {
    requireValue(value.includes(path), `commit.managedFiles must include ${path}`);
  }
  requireValue(value.length === expected.length, "commit.managedFiles must contain only the managed firmware files");
}

function requireArtifactNames(value) {
  requireValue(Array.isArray(value), "build.artifactNames must be an array");
  if (!Array.isArray(value)) {
    return;
  }
  requireValue(value.length > 0, "build.artifactNames must not be empty");
  for (const name of value) {
    requireNonPlaceholderString(name, "build.artifactNames must contain non-placeholder names");
  }
}

function requireGitHubArtifacts(value, artifactNames) {
  requireValue(Array.isArray(value), "build.githubArtifacts must be an array");
  if (!Array.isArray(value)) {
    return;
  }
  requireValue(value.length > 0, "build.githubArtifacts must not be empty");
  if (Array.isArray(artifactNames)) {
    requireValue(value.length === artifactNames.length, "build.githubArtifacts must match build.artifactNames length");
  }
  for (const artifact of value) {
    requirePositiveInteger(artifact?.id, "build.githubArtifacts[].id must be a positive integer");
    requireNonPlaceholderString(artifact?.name, "build.githubArtifacts[].name must be a non-placeholder name");
    requirePositiveInteger(artifact?.sizeInBytes, "build.githubArtifacts[].sizeInBytes must be a positive integer");
    requireValue(artifact?.expired === false, "build.githubArtifacts[].expired must be false");
    if (Array.isArray(artifactNames) && typeof artifact?.name === "string") {
      requireValue(artifactNames.includes(artifact.name), "build.githubArtifacts[].name must be listed in build.artifactNames");
    }
  }
}

function requireGitHubArtifactUf2Files(value, githubArtifacts) {
  requireValue(Array.isArray(value), "build.githubArtifactUf2Files must be an array");
  if (!Array.isArray(value)) {
    return [];
  }
  requireValue(value.length > 0, "build.githubArtifactUf2Files must not be empty");
  const artifactIds = Array.isArray(githubArtifacts) ? githubArtifacts.map((artifact) => artifact?.id) : [];
  for (const uf2 of value) {
    requirePositiveInteger(uf2?.artifactId, "build.githubArtifactUf2Files[].artifactId must be a positive integer");
    requireNonPlaceholderString(uf2?.artifactName, "build.githubArtifactUf2Files[].artifactName must be a non-placeholder name");
    requireNonEmptyString(uf2?.name, "build.githubArtifactUf2Files[].name is required");
    requireValue(typeof uf2?.name === "string" && uf2.name.toLowerCase().endsWith(".uf2"), "build.githubArtifactUf2Files[].name must end with .uf2");
    requirePositiveInteger(uf2?.sizeInBytes, "build.githubArtifactUf2Files[].sizeInBytes must be a positive integer");
    requireSha256(uf2?.sha256, "build.githubArtifactUf2Files[].sha256 must be a SHA-256 hash");
    requireNonPlaceholderHash(uf2?.sha256, "build.githubArtifactUf2Files[].sha256 must not be a placeholder hash");
    if (artifactIds.length > 0) {
      requireValue(artifactIds.includes(uf2?.artifactId), "build.githubArtifactUf2Files[].artifactId must match build.githubArtifacts[].id");
    }
  }
  return value;
}

function requireGitHubArtifactManifests(value, githubArtifacts) {
  requireValue(Array.isArray(value), "build.githubArtifactManifests must be an array");
  if (!Array.isArray(value)) {
    return [];
  }
  const artifactIds = Array.isArray(githubArtifacts) ? githubArtifacts.map((artifact) => artifact?.id) : [];
  for (const manifest of value) {
    requirePositiveInteger(manifest?.artifactId, "build.githubArtifactManifests[].artifactId must be a positive integer");
    requireNonPlaceholderString(manifest?.artifactName, "build.githubArtifactManifests[].artifactName must be a non-placeholder name");
    requireNonEmptyString(manifest?.name, "build.githubArtifactManifests[].name is required");
    requireValue(
      typeof manifest?.name === "string" &&
        (artifactBasename(manifest.name) === "manifest.json" || artifactBasename(manifest.name) === "firmware-manifest.json"),
      "build.githubArtifactManifests[].name must be manifest.json or firmware-manifest.json",
    );
    requirePositiveInteger(manifest?.sizeInBytes, "build.githubArtifactManifests[].sizeInBytes must be a positive integer");
    requireSha256(manifest?.sha256, "build.githubArtifactManifests[].sha256 must be a SHA-256 hash");
    requireNonPlaceholderHash(manifest?.sha256, "build.githubArtifactManifests[].sha256 must not be a placeholder hash");
    requireValue(isRecord(manifest?.targets), "build.githubArtifactManifests[].targets must be an object");
    if (isRecord(manifest?.targets)) {
      requireValue(
        manifest.targets.left === null || (typeof manifest.targets.left === "string" && manifest.targets.left.toLowerCase().endsWith(".uf2")),
        "build.githubArtifactManifests[].targets.left must be null or a UF2 path",
      );
      requireValue(
        manifest.targets.right === null || (typeof manifest.targets.right === "string" && manifest.targets.right.toLowerCase().endsWith(".uf2")),
        "build.githubArtifactManifests[].targets.right must be null or a UF2 path",
      );
    }
    if (artifactIds.length > 0) {
      requireValue(manifest?.artifactId && artifactIds.includes(manifest.artifactId), "build.githubArtifactManifests[].artifactId must match build.githubArtifacts[].id");
    }
  }
  return value;
}

function requireArtifactSide(value, side) {
  requireNonEmptyString(value?.uf2Name, `artifacts.${side}.uf2Name is required`);
  requireValue(typeof value?.uf2Name === "string" && value.uf2Name.toLowerCase().endsWith(".uf2"), `artifacts.${side}.uf2Name must end with .uf2`);
  requireSha256(value?.sha256, `artifacts.${side}.sha256 must be a SHA-256 hash`);
  requireNonPlaceholderHash(value?.sha256, `artifacts.${side}.sha256 must not be a placeholder hash`);
}

function requireClassificationProof(artifacts, manifests) {
  if (artifacts?.classificationSource === "manifest") {
    requireValue(Array.isArray(manifests) && manifests.length > 0, "artifacts.classificationSource manifest requires build.githubArtifactManifests");
    requireValue(
      Array.isArray(manifests) &&
        manifests.some(
          (manifest) =>
            isRecord(manifest?.targets) &&
            artifactBasename(manifest.targets.left) === artifactBasename(artifacts?.left?.uf2Name) &&
            artifactBasename(manifest.targets.right) === artifactBasename(artifacts?.right?.uf2Name),
        ),
      "artifacts.classificationSource manifest requires manifest targets to match left and right UF2 names",
    );
    return;
  }
  if (artifacts?.classificationSource === "filename") {
    requireValue(sideTokenMatches(artifacts?.left?.uf2Name, "left"), "artifacts.left.uf2Name must include a left token when classificationSource is filename");
    requireValue(sideTokenMatches(artifacts?.right?.uf2Name, "right"), "artifacts.right.uf2Name must include a right token when classificationSource is filename");
  }
}

function requireArtifactUf2Proof(githubArtifactUf2Files, value, side) {
  if (!Array.isArray(githubArtifactUf2Files) || !value?.uf2Name || !value?.sha256) {
    return;
  }
  requireValue(
    githubArtifactUf2Files.some(
      (uf2) => artifactBasename(uf2?.name) === artifactBasename(value.uf2Name) && uf2?.sha256 === value.sha256,
    ),
    `artifacts.${side} must match a UF2 entry from build.githubArtifactUf2Files`,
  );
}

function requireFlashSide(value, side, expectedUf2Name) {
  requireValue(value?.completed === true, `flash.${side}.completed must be true`);
  requireValue(value?.bootloaderMarkerChecked === true, `flash.${side}.bootloaderMarkerChecked must be true`);
  requireValue(value?.confirmationPromptAccepted === true, `flash.${side}.confirmationPromptAccepted must be true`);
  requireValue(value?.keyboardHalfChecked === true, `flash.${side}.keyboardHalfChecked must be true`);
  requireValue(value?.uf2Name === expectedUf2Name, `flash.${side}.uf2Name must match artifacts.${side}.uf2Name`);
  requireIsoTimestamp(value?.completedAt, `flash.${side}.completedAt must be an ISO timestamp`);
}

function artifactBasename(value) {
  return typeof value === "string" ? (value.split(/[\\/]/).pop() ?? value) : "";
}

function sideTokenMatches(value, side) {
  return inferredUf2Side(value) === side;
}

function inferredUf2Side(value) {
  if (typeof value !== "string") {
    return null;
  }
  const tokens = artifactBasename(value)
    .toLowerCase()
    .replace(/\.uf2$/, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const hasLeft = tokens.includes("left") || tokens.includes("l");
  const hasRight = tokens.includes("right") || tokens.includes("r");
  if (hasLeft === hasRight) {
    return null;
  }
  return hasLeft ? "left" : "right";
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
