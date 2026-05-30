import { describe, expect, it } from "vitest";
import {
  canFlashFirmwareSide,
  classifyUf2Artifacts,
  deriveFirmwareReleaseReadiness,
  type FirmwareReleaseState,
} from "./firmwareReleaseFlow";

const baseState: FirmwareReleaseState = {
  authenticated: false,
  branchSelected: false,
  repositorySelected: false,
  filesLoaded: false,
  hasLocalChanges: false,
  diffReviewed: false,
  commitSha: null,
  buildRunId: null,
  buildStatus: "idle",
  artifactFiles: [],
  leftFlashed: false,
  rightFlashed: false,
};

describe("classifyUf2Artifacts", () => {
  it("classifies left and right UF2 files by filename tokens", () => {
    expect(
      classifyUf2Artifacts([
        "/tmp/artifacts/KobitoKey_left.uf2",
        "/tmp/artifacts/KobitoKey_right.uf2",
      ]),
    ).toEqual({
      left: "/tmp/artifacts/KobitoKey_left.uf2",
      right: "/tmp/artifacts/KobitoKey_right.uf2",
      unknown: [],
    });
  });

  it("keeps ambiguous and duplicate UF2 files out of the safe left/right slots", () => {
    expect(
      classifyUf2Artifacts([
        "KobitoKey.uf2",
        "KobitoKey_left.uf2",
        "KobitoKey_l.uf2",
        "notes.txt",
      ]),
    ).toEqual({
      left: "KobitoKey_left.uf2",
      right: null,
      unknown: ["KobitoKey.uf2", "KobitoKey_l.uf2"],
    });
  });
});

describe("deriveFirmwareReleaseReadiness", () => {
  it("blocks at GitHub connection before any firmware release action", () => {
    expect(deriveFirmwareReleaseReadiness(baseState)).toMatchObject({
      step: "connect-github",
      nextAction: "GitHub で接続",
      canCommit: false,
      canBuild: false,
    });
  });

  it("allows commit only after files are changed and diff is reviewed", () => {
    const readiness = deriveFirmwareReleaseReadiness({
      ...baseState,
      authenticated: true,
      branchSelected: true,
      repositorySelected: true,
      filesLoaded: true,
      hasLocalChanges: true,
      diffReviewed: true,
    });

    expect(readiness).toMatchObject({
      step: "commit",
      canCommit: true,
      canBuild: false,
    });
  });

  it("blocks repository actions until a branch is selected", () => {
    const readiness = deriveFirmwareReleaseReadiness({
      ...baseState,
      authenticated: true,
      repositorySelected: true,
      filesLoaded: true,
      hasLocalChanges: true,
      diffReviewed: true,
    });

    expect(readiness).toMatchObject({
      step: "select-repository",
      nextAction: "Branch を入力",
      blockers: ["GitHub branch が未入力です"],
      canCommit: false,
      canBuild: false,
    });
  });

  it("continues to build after a commit even when the local diff has been saved", () => {
    const readiness = deriveFirmwareReleaseReadiness({
      ...baseState,
      authenticated: true,
      branchSelected: true,
      repositorySelected: true,
      filesLoaded: false,
      hasLocalChanges: false,
      diffReviewed: false,
      commitSha: "abc123",
    });

    expect(readiness).toMatchObject({
      step: "build",
      canCommit: false,
      canBuild: true,
    });
  });

  it("requires a new commit when files change after an earlier commit", () => {
    const readiness = deriveFirmwareReleaseReadiness({
      ...baseState,
      authenticated: true,
      branchSelected: true,
      repositorySelected: true,
      filesLoaded: true,
      hasLocalChanges: true,
      diffReviewed: false,
      commitSha: "old123",
      buildRunId: "987",
      buildStatus: "success",
      artifactFiles: ["KobitoKey_left.uf2", "KobitoKey_right.uf2"],
    });

    expect(readiness).toMatchObject({
      step: "review-diff",
      canBuild: false,
      canDownloadArtifact: false,
      canFlashLeft: false,
    });
  });

  it("closes both flash gates when files change after a partial flash", () => {
    const readiness = deriveFirmwareReleaseReadiness({
      ...baseState,
      authenticated: true,
      branchSelected: true,
      repositorySelected: true,
      filesLoaded: true,
      hasLocalChanges: true,
      diffReviewed: false,
      commitSha: "old123",
      buildRunId: "987",
      buildStatus: "success",
      artifactFiles: ["KobitoKey_left.uf2", "KobitoKey_right.uf2"],
      leftFlashed: true,
    });

    expect(readiness).toMatchObject({
      step: "review-diff",
      canBuild: false,
      canDownloadArtifact: false,
      canFlashLeft: false,
      canFlashRight: false,
      complete: false,
    });
    expect(canFlashFirmwareSide(readiness, "left")).toBe(false);
    expect(canFlashFirmwareSide(readiness, "right")).toBe(false);
  });

  it("requires a successful build before artifact download", () => {
    expect(
      deriveFirmwareReleaseReadiness({
        ...baseState,
        authenticated: true,
        branchSelected: true,
        repositorySelected: true,
        filesLoaded: true,
        hasLocalChanges: false,
        diffReviewed: false,
        commitSha: "abc123",
        buildRunId: "987",
        buildStatus: "in_progress",
      }),
    ).toMatchObject({
      step: "build",
      canDownloadArtifact: false,
    });

    expect(
      deriveFirmwareReleaseReadiness({
        ...baseState,
        authenticated: true,
        branchSelected: true,
        repositorySelected: true,
        filesLoaded: true,
        hasLocalChanges: false,
        diffReviewed: false,
        commitSha: "abc123",
        buildRunId: "987",
        buildStatus: "success",
      }),
    ).toMatchObject({
      step: "download-artifact",
      canDownloadArtifact: true,
    });
  });

  it("requires a verified successful run before either side can be flashed", () => {
    const readiness = deriveFirmwareReleaseReadiness({
      ...baseState,
      authenticated: true,
      branchSelected: true,
      repositorySelected: true,
      filesLoaded: true,
      hasLocalChanges: false,
      diffReviewed: false,
      commitSha: "abc123",
      buildRunId: null,
      buildStatus: "success",
      artifactFiles: ["KobitoKey_left.uf2", "KobitoKey_right.uf2"],
    });

    expect(readiness).toMatchObject({
      step: "build",
      canFlashLeft: false,
      canFlashRight: false,
      complete: false,
    });
  });

  it("forces left flash before right flash and reports completion after both sides", () => {
    const readyToFlash = {
      ...baseState,
      authenticated: true,
      branchSelected: true,
      repositorySelected: true,
      filesLoaded: true,
      hasLocalChanges: false,
      diffReviewed: false,
      commitSha: "abc123",
      buildRunId: "987",
      buildStatus: "success" as const,
      artifactFiles: ["KobitoKey_left.uf2", "KobitoKey_right.uf2"],
    };

    expect(deriveFirmwareReleaseReadiness(readyToFlash)).toMatchObject({
      step: "flash-left",
      canFlashLeft: true,
      canFlashRight: false,
    });
    expect(canFlashFirmwareSide(deriveFirmwareReleaseReadiness(readyToFlash), "left")).toBe(true);
    expect(canFlashFirmwareSide(deriveFirmwareReleaseReadiness(readyToFlash), "right")).toBe(false);

    expect(deriveFirmwareReleaseReadiness({ ...readyToFlash, leftFlashed: true })).toMatchObject({
      step: "flash-right",
      canFlashLeft: false,
      canFlashRight: true,
    });
    expect(canFlashFirmwareSide(deriveFirmwareReleaseReadiness({ ...readyToFlash, leftFlashed: true }), "left")).toBe(false);
    expect(canFlashFirmwareSide(deriveFirmwareReleaseReadiness({ ...readyToFlash, leftFlashed: true }), "right")).toBe(true);

    expect(deriveFirmwareReleaseReadiness({ ...readyToFlash, leftFlashed: true, rightFlashed: true })).toMatchObject({
      step: "done",
      complete: true,
    });
  });

  it("uses resolved artifact targets instead of reclassifying filenames before flash", () => {
    const readiness = deriveFirmwareReleaseReadiness({
      ...baseState,
      authenticated: true,
      branchSelected: true,
      repositorySelected: true,
      filesLoaded: true,
      hasLocalChanges: false,
      diffReviewed: false,
      commitSha: "abc123",
      buildRunId: "987",
      buildStatus: "success",
      artifactFiles: ["KobitoKey_left.uf2", "KobitoKey_right.uf2"],
      artifactTargets: {
        left: null,
        right: null,
        unknown: ["KobitoKey_left.uf2", "KobitoKey_right.uf2"],
      },
    });

    expect(readiness).toMatchObject({
      step: "download-artifact",
      canFlashLeft: false,
      canFlashRight: false,
      complete: false,
    });
  });

  it("blocks flash when left and right artifact basenames are the same", () => {
    const readiness = deriveFirmwareReleaseReadiness({
      ...baseState,
      authenticated: true,
      branchSelected: true,
      repositorySelected: true,
      filesLoaded: true,
      hasLocalChanges: false,
      diffReviewed: false,
      commitSha: "abc123",
      buildRunId: "987",
      buildStatus: "success",
      artifactTargets: {
        left: "left/KobitoKey.uf2",
        right: "right/KobitoKey.uf2",
        unknown: [],
      },
      artifactFiles: ["left/KobitoKey.uf2", "right/KobitoKey.uf2"],
    });

    expect(readiness).toMatchObject({
      step: "download-artifact",
      canFlashLeft: false,
      canFlashRight: false,
      complete: false,
    });
  });
});
