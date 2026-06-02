import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const dir = mkdtempSync(join(tmpdir(), "browser-firmware-evidence-"));

try {
  const validReportPath = join(dir, "valid.json");
  const invalidReportPath = join(dir, "invalid.json");
  const previewReportPath = join(dir, "preview.json");
  const filenameReportPath = join(dir, "filename.json");
  const ambiguousFilenameReportPath = join(dir, "ambiguous-filename.json");
  const artifactMismatchReportPath = join(dir, "artifact-mismatch.json");
  const manifestArtifactMismatchReportPath = join(dir, "manifest-artifact-mismatch.json");
  const reversedFlashReportPath = join(dir, "reversed-flash.json");
  writeFileSync(validReportPath, JSON.stringify(createValidReport(), null, 2));
  writeFileSync(invalidReportPath, JSON.stringify(createInvalidReport(), null, 2));
  writeFileSync(previewReportPath, JSON.stringify(createPreviewReport(), null, 2));
  writeFileSync(filenameReportPath, JSON.stringify(createFilenameReport(), null, 2));
  writeFileSync(ambiguousFilenameReportPath, JSON.stringify(createAmbiguousFilenameReport(), null, 2));
  writeFileSync(artifactMismatchReportPath, JSON.stringify(createArtifactMismatchReport(), null, 2));
  writeFileSync(manifestArtifactMismatchReportPath, JSON.stringify(createManifestArtifactMismatchReport(), null, 2));
  writeFileSync(reversedFlashReportPath, JSON.stringify(createReversedFlashReport(), null, 2));

  const valid = runValidator(validReportPath);
  if (valid.status !== 0) {
    console.error("Expected valid external evidence report to pass");
    process.stderr.write(valid.stderr);
    process.exit(1);
  }

  const invalid = runValidator(invalidReportPath);
  if (invalid.status === 0) {
    console.error("Expected placeholder external evidence report to fail");
    process.exit(1);
  }

  const requiredErrors = [
    "production.url must not be a placeholder URL",
    "production.url must open browser Firmware Mode with mode=firmware",
    "production.url must use the expected public production origin",
    "production.fetchUrl must match production.url for public release evidence",
    "production.appCommitSha must be a 40-character SHA",
    "production.apiSecurityHeadersChecked must be true",
    "production.workerOAuthDeviceFlowStarted must be true",
    "production.frontendOAuthClientIdPresent must be true",
    "ci.appCommitSha must not be a placeholder SHA",
    "ci.runUrl must point to s-hiraoku/kobitokey-studio Actions run",
    "ci.runHeadSha must match ci.appCommitSha",
    "ci.status must be completed",
    "ci.conclusion must be success",
    "ci.releaseGateJobName must be Browser firmware release gates",
    "ci.releaseGateJobConclusion must be success",
    "github.repository must not be the template owner/repo placeholder",
    "github.branch is required",
    "commit.sha must not be a placeholder SHA",
    "commit.url must point to github.repository and commit.sha",
    "commit.managedFiles must not contain duplicate paths",
    "commit.managedFiles must contain only managed firmware files: README.md",
    "build.runUrl must point to github.repository and build.runId",
    "build.headBranch must match github.branch",
    "build.artifactNames must not be empty",
    "build.githubArtifacts must not be empty",
    "build.githubArtifactUf2Files must not be empty",
    "artifacts.classificationSource manifest requires build.githubArtifactManifests",
    "artifacts.classificationSource manifest requires manifest targets to match left and right UF2 names",
    "artifacts.left.sha256 must not be a placeholder hash",
    "artifacts.left.artifactId must be a positive integer",
    "artifacts.left.artifactName must be a non-placeholder name",
    "artifacts.left must match a UF2 entry from build.githubArtifactUf2Files",
    "left and right artifact UF2 basenames must differ",
    "flash.left.method must be direct-copy or download-copy",
    "flash.left.confirmationPromptAccepted must be true",
    "flash.right.keyboardHalfChecked must be true",
    "verifiedAt must be the same as or later than flash.right.completedAt",
    "ui.tokenClearWorks must be true",
    "ui.referencedLayerDeleteBlocked must be true",
    "ui.artifactProvenanceVisible must be true",
    "ui.artifactProvenanceMatchesBuildArtifacts must be true",
    "ui.publicEntryLinksPassed must be true",
    "ui.publicEntryUrls must contain only absolute https URLs",
    "ui.publicEntryUrls must use the same production origin as production.url",
    "ui.smokeCommand must be npm run check:browser-firmware:ui or node scripts/check-browser-firmware-ui-smoke.mjs",
  ];
  for (const error of requiredErrors) {
    if (!invalid.stderr.includes(error)) {
      console.error(`Expected invalid report to include: ${error}`);
      process.stderr.write(invalid.stderr);
      process.exit(1);
    }
  }

  const preview = runValidator(previewReportPath);
  if (preview.status === 0) {
    console.error("Expected preview URL external evidence report to fail");
    process.exit(1);
  }
  if (!preview.stderr.includes("production.url must use the expected public production origin")) {
    console.error("Expected preview URL report to reject the production origin");
    process.stderr.write(preview.stderr);
    process.exit(1);
  }

  const filename = runValidator(filenameReportPath);
  if (filename.status !== 0) {
    console.error("Expected filename-classified external evidence report with l/r tokens to pass");
    process.stderr.write(filename.stderr);
    process.exit(1);
  }

  const ambiguousFilename = runValidator(ambiguousFilenameReportPath);
  if (ambiguousFilename.status === 0) {
    console.error("Expected ambiguous filename-classified external evidence report to fail");
    process.exit(1);
  }
  if (!ambiguousFilename.stderr.includes("artifacts.left.uf2Name must include a left token when classificationSource is filename")) {
    console.error("Expected ambiguous filename report to reject the left UF2 name");
    process.stderr.write(ambiguousFilename.stderr);
    process.exit(1);
  }

  const artifactMismatch = runValidator(artifactMismatchReportPath);
  if (artifactMismatch.status === 0) {
    console.error("Expected artifact mismatch external evidence report to fail");
    process.exit(1);
  }
  for (const error of [
    "build.githubArtifactUf2Files[].artifactName must match build.githubArtifacts[].name for artifactId",
    "build.githubArtifactManifests[].artifactName must match build.githubArtifacts[].name for artifactId",
  ]) {
    if (!artifactMismatch.stderr.includes(error)) {
      console.error(`Expected artifact mismatch report to include: ${error}`);
      process.stderr.write(artifactMismatch.stderr);
      process.exit(1);
    }
  }

  const manifestArtifactMismatch = runValidator(manifestArtifactMismatchReportPath);
  if (manifestArtifactMismatch.status === 0) {
    console.error("Expected manifest artifact mismatch external evidence report to fail");
    process.exit(1);
  }
  if (
    !manifestArtifactMismatch.stderr.includes(
      "artifacts.classificationSource manifest requires manifest targets to match UF2 entries from the same GitHub artifact",
    )
  ) {
    console.error("Expected manifest artifact mismatch report to reject cross-artifact manifest proof");
    process.stderr.write(manifestArtifactMismatch.stderr);
    process.exit(1);
  }

  const reversedFlash = runValidator(reversedFlashReportPath);
  if (reversedFlash.status === 0) {
    console.error("Expected reversed flash timestamp external evidence report to fail");
    process.exit(1);
  }
  if (!reversedFlash.stderr.includes("flash.right.completedAt must be the same as or later than flash.left.completedAt")) {
    console.error("Expected reversed flash timestamp report to reject right-before-left flash order");
    process.stderr.write(reversedFlash.stderr);
    process.exit(1);
  }

  console.log("OK browser firmware external evidence validator self-test passed");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

function runValidator(reportPath) {
  return spawnSync(process.execPath, ["scripts/check-browser-firmware-external-evidence.mjs", reportPath], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

function createValidReport() {
  const commit = "0123456789abcdef0123456789abcdef01234567";
  return {
    schemaVersion: 1,
    verifiedAt: "2026-05-27T00:13:00Z",
    tester: "release-qa",
    production: {
      url: "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware",
      fetchUrl: "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware",
      appCommitSha: "89abcdef0123456789abcdef0123456789abcdef",
      workerDeviceCodeRouteChecked: true,
      workerAccessTokenRouteChecked: true,
      workerUnsupportedScopeRejected: true,
      workerOAuthDeviceFlowStarted: true,
      frontendOAuthClientIdPresent: true,
      workerArtifactRouteChecked: true,
      securityHeadersChecked: true,
      apiSecurityHeadersChecked: true,
    },
    ci: {
      runUrl: "https://github.com/s-hiraoku/kobitokey-studio/actions/runs/123456789",
      runHeadSha: "89abcdef0123456789abcdef0123456789abcdef",
      status: "completed",
      conclusion: "success",
      appCommitSha: "89abcdef0123456789abcdef0123456789abcdef",
      releaseGateJobName: "Browser firmware release gates",
      releaseGateJobConclusion: "success",
      browserFirmwareReleaseCheckPassed: true,
    },
    github: {
      repository: "juichi50iii/KobitoKey_QWERTY",
      branch: "browser-firmware-release-test",
      oauthDeviceFlowVerified: true,
      oauthScopeVerified: true,
      rateLimitBehaviorVerified: true,
    },
    commit: {
      sha: commit,
      url: `https://github.com/juichi50iii/KobitoKey_QWERTY/commit/${commit}`,
      managedFiles: ["config/KobitoKey.keymap"],
    },
    build: {
      runId: 123,
      runUrl: "https://github.com/juichi50iii/KobitoKey_QWERTY/actions/runs/123",
      headSha: commit,
      headBranch: "browser-firmware-release-test",
      status: "completed",
      conclusion: "success",
      event: "workflow_dispatch",
      artifactDownloaded: true,
      artifactNames: ["firmware"],
      githubArtifacts: [{ id: 456, name: "firmware", sizeInBytes: 12345, expired: false }],
      githubArtifactUf2Files: [
        {
          artifactId: 456,
          artifactName: "firmware",
          name: "firmware/kobitokey_left.uf2",
          sizeInBytes: 123,
          sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
        {
          artifactId: 456,
          artifactName: "firmware",
          name: "firmware/kobitokey_right.uf2",
          sizeInBytes: 456,
          sha256: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        },
      ],
      githubArtifactManifests: [
        {
          artifactId: 456,
          artifactName: "firmware",
          name: "firmware/manifest.json",
          sizeInBytes: 90,
          sha256: "123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0",
          targets: {
            left: "firmware/kobitokey_left.uf2",
            right: "firmware/kobitokey_right.uf2",
          },
        },
      ],
      artifactsExpired: false,
    },
    artifacts: {
      classificationSource: "manifest",
      left: {
        uf2Name: "kobitokey_left.uf2",
        sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        artifactId: 456,
        artifactName: "firmware",
      },
      right: {
        uf2Name: "kobitokey_right.uf2",
        sha256: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        artifactId: 456,
        artifactName: "firmware",
      },
    },
    flash: {
      left: {
        completed: true,
        method: "direct-copy",
        bootloaderMarkerChecked: true,
        confirmationPromptAccepted: true,
        keyboardHalfChecked: true,
        uf2Name: "kobitokey_left.uf2",
        completedAt: "2026-05-27T00:10:00Z",
      },
      right: {
        completed: true,
        method: "download-copy",
        bootloaderMarkerChecked: true,
        confirmationPromptAccepted: true,
        keyboardHalfChecked: true,
        uf2Name: "kobitokey_right.uf2",
        completedAt: "2026-05-27T00:12:00Z",
      },
    },
    persistence: {
      reloadRestoredProgress: true,
      tokenStored: false,
      uf2BytesStored: false,
    },
    ui: {
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
      publicEntryUrls: publicEntryUrls(),
      smokeCommand: "npm run check:browser-firmware:ui",
      smokeViewportCount: 2,
    },
  };
}

function createInvalidReport() {
  return {
    ...createValidReport(),
    production: {
      url: "https://example.com/",
      fetchUrl: "https://preview.example.com/?mode=firmware",
      workerDeviceCodeRouteChecked: true,
      workerAccessTokenRouteChecked: true,
      workerUnsupportedScopeRejected: true,
      workerOAuthDeviceFlowStarted: false,
      frontendOAuthClientIdPresent: false,
      workerArtifactRouteChecked: true,
      securityHeadersChecked: true,
      apiSecurityHeadersChecked: false,
    },
    ci: {
      ...createValidReport().ci,
      runUrl: "https://github.com/juichi50iii/KobitoKey_QWERTY/actions/runs/123",
      runHeadSha: "89abcdef0123456789abcdef0123456789abcdef",
      status: "in_progress",
      conclusion: "failure",
      appCommitSha: "0000000000000000000000000000000000000000",
      releaseGateJobName: "",
      releaseGateJobConclusion: "failure",
    },
    github: {
      repository: "owner/repo",
      branch: "<firmware repository branch used by Commit & Build>",
      oauthDeviceFlowVerified: true,
      oauthScopeVerified: true,
      rateLimitBehaviorVerified: true,
    },
    commit: {
      ...createValidReport().commit,
      sha: "0000000000000000000000000000000000000000",
      url: `https://github.com/juichi50iii/KobitoKey_QWERTY.evil/commit/${createValidReport().commit.sha}`,
      managedFiles: ["config/KobitoKey.keymap", "config/KobitoKey.keymap", "README.md"],
    },
    build: {
      ...createValidReport().build,
      runUrl: "https://github.com/juichi50iii/KobitoKey_QWERTY.evil/actions/runs/123",
      headBranch: "wrong-branch",
      artifactNames: [],
      githubArtifacts: [],
      githubArtifactUf2Files: [],
      githubArtifactManifests: [],
    },
    artifacts: {
      ...createValidReport().artifacts,
      left: {
        uf2Name: "kobitokey_left.uf2",
        sha256: "0000000000000000000000000000000000000000000000000000000000000000",
      },
      right: {
        ...createValidReport().artifacts.right,
        uf2Name: "nested/kobitokey_left.uf2",
      },
    },
    flash: {
      ...createValidReport().flash,
      left: {
        ...createValidReport().flash.left,
        method: "manual",
        confirmationPromptAccepted: false,
      },
      right: {
        ...createValidReport().flash.right,
        keyboardHalfChecked: false,
      },
    },
    verifiedAt: "2026-05-27T00:11:00Z",
    ui: {
      ...createValidReport().ui,
      tokenClearWorks: false,
      referencedLayerDeleteBlocked: false,
      artifactProvenanceVisible: false,
      artifactProvenanceMatchesBuildArtifacts: false,
      publicEntryLinksPassed: false,
      publicEntryUrls: ["http://example.com/?mode=firmware"],
      smokeCommand: "manual",
    },
  };
}

function publicEntryUrls() {
  const origin = "https://kobitokey-studio.s-hiraoku.workers.dev";
  return [
    "/?mode=firmware",
    "/?mode=firmware&tab=combos",
    "/?mode=firmware&tab=trackball",
    "/?mode=firmware&tab=diff",
    "/?mode=firmware&tab=build",
    "/?mode=direct",
  ].map((path) => new URL(path, origin).href);
}

function createPreviewReport() {
  return {
    ...createValidReport(),
    production: {
      ...createValidReport().production,
      url: "https://feature-firmware-mode-kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware",
      fetchUrl: "https://feature-firmware-mode-kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware",
    },
  };
}

function createFilenameReport() {
  const report = createValidReport();
  return {
    ...report,
    build: {
      ...report.build,
      githubArtifactUf2Files: [
        {
          ...report.build.githubArtifactUf2Files[0],
          name: "firmware/kobitokey_l.uf2",
        },
        {
          ...report.build.githubArtifactUf2Files[1],
          name: "firmware/kobitokey_r.uf2",
        },
      ],
      githubArtifactManifests: [],
    },
    artifacts: {
      classificationSource: "filename",
      left: {
        uf2Name: "kobitokey_l.uf2",
        sha256: report.artifacts.left.sha256,
        artifactId: 456,
        artifactName: "firmware",
      },
      right: {
        uf2Name: "kobitokey_r.uf2",
        sha256: report.artifacts.right.sha256,
        artifactId: 456,
        artifactName: "firmware",
      },
    },
    flash: {
      left: {
        ...report.flash.left,
        uf2Name: "kobitokey_l.uf2",
      },
      right: {
        ...report.flash.right,
        uf2Name: "kobitokey_r.uf2",
      },
    },
  };
}

function createAmbiguousFilenameReport() {
  const report = createFilenameReport();
  return {
    ...report,
    build: {
      ...report.build,
      githubArtifactUf2Files: [
        {
          ...report.build.githubArtifactUf2Files[0],
          name: "firmware/kobitokey_left_right.uf2",
        },
        report.build.githubArtifactUf2Files[1],
      ],
    },
    artifacts: {
      ...report.artifacts,
      left: {
        ...report.artifacts.left,
        uf2Name: "kobitokey_left_right.uf2",
      },
    },
    flash: {
      ...report.flash,
      left: {
        ...report.flash.left,
        uf2Name: "kobitokey_left_right.uf2",
      },
    },
  };
}

function createArtifactMismatchReport() {
  const report = createValidReport();
  return {
    ...report,
    build: {
      ...report.build,
      githubArtifactUf2Files: report.build.githubArtifactUf2Files.map((file) => ({
        ...file,
        artifactName: "wrong-artifact",
      })),
      githubArtifactManifests: report.build.githubArtifactManifests.map((manifest) => ({
        ...manifest,
        artifactName: "wrong-artifact",
      })),
    },
  };
}

function createManifestArtifactMismatchReport() {
  const report = createValidReport();
  return {
    ...report,
    build: {
      ...report.build,
      artifactNames: ["firmware", "manifest"],
      githubArtifacts: [
        ...report.build.githubArtifacts,
        { id: 789, name: "manifest", sizeInBytes: 1000, expired: false },
      ],
      githubArtifactManifests: report.build.githubArtifactManifests.map((manifest) => ({
        ...manifest,
        artifactId: 789,
        artifactName: "manifest",
      })),
    },
  };
}

function createReversedFlashReport() {
  const report = createValidReport();
  return {
    ...report,
    flash: {
      ...report.flash,
      left: {
        ...report.flash.left,
        completedAt: "2026-05-27T00:12:00Z",
      },
      right: {
        ...report.flash.right,
        completedAt: "2026-05-27T00:10:00Z",
      },
    },
  };
}
