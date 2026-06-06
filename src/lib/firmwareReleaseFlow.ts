export type FirmwareReleaseStep =
  | "connect-github"
  | "select-repository"
  | "load-files"
  | "edit"
  | "review-diff"
  | "commit"
  | "build"
  | "download-artifact"
  | "flash-left"
  | "flash-right"
  | "done";

export type FirmwareBuildStatus = "idle" | "queued" | "in_progress" | "success" | "failure" | "cancelled" | "unknown";

export type FlashSide = "left" | "right";

export type ClassifiedUf2Artifacts = {
  left: string | null;
  right: string | null;
  unknown: string[];
};

export type FirmwareReleaseState = {
  authenticated: boolean;
  branchSelected: boolean;
  repositorySelected: boolean;
  filesLoaded: boolean;
  hasLocalChanges: boolean;
  diffReviewed: boolean;
  commitSha: string | null;
  buildRunId: string | null;
  buildStatus: FirmwareBuildStatus;
  artifactFiles: string[];
  externalArtifactsReady?: boolean;
  artifactTargets?: ClassifiedUf2Artifacts;
  leftFlashed: boolean;
  rightFlashed: boolean;
};

export type FirmwareReleaseReadiness = {
  step: FirmwareReleaseStep;
  nextAction: string;
  blockers: string[];
  canCommit: boolean;
  canBuild: boolean;
  canDownloadArtifact: boolean;
  canFlashLeft: boolean;
  canFlashRight: boolean;
  complete: boolean;
};

export function classifyUf2Artifacts(files: string[]): ClassifiedUf2Artifacts {
  const result: ClassifiedUf2Artifacts = { left: null, right: null, unknown: [] };

  for (const file of files.filter((value) => value.toLowerCase().endsWith(".uf2"))) {
    const side = inferUf2Side(file);
    if (side === "left" && result.left === null) {
      result.left = file;
    } else if (side === "right" && result.right === null) {
      result.right = file;
    } else {
      result.unknown.push(file);
    }
  }

  return result;
}

export function deriveFirmwareReleaseReadiness(state: FirmwareReleaseState): FirmwareReleaseReadiness {
  const artifacts = state.artifactTargets ?? classifyUf2Artifacts(state.artifactFiles);
  const hasCompleteArtifacts = hasDistinctCompleteArtifacts(artifacts);
  const buildSucceeded = state.buildStatus === "success";
  const hasCommittedChanges = Boolean(state.commitSha);
  const committedRevisionIsCurrent = hasCommittedChanges && !state.hasLocalChanges;
  const hasVerifiedSuccessfulRun = committedRevisionIsCurrent && Boolean(state.buildRunId) && buildSucceeded;
  const canUseExternalArtifacts = Boolean(state.externalArtifactsReady);
  const hasFlashableArtifacts = (hasVerifiedSuccessfulRun || canUseExternalArtifacts) && hasCompleteArtifacts;
  const canCommit =
    state.authenticated &&
    state.repositorySelected &&
    state.branchSelected &&
    state.filesLoaded &&
    state.hasLocalChanges &&
    state.diffReviewed;
  const canBuild = committedRevisionIsCurrent && state.authenticated && state.repositorySelected && state.branchSelected;
  const canDownloadArtifact =
    committedRevisionIsCurrent &&
    state.authenticated &&
    state.repositorySelected &&
    state.branchSelected &&
    Boolean(state.buildRunId) &&
    buildSucceeded;
  const canFlashLeft = hasFlashableArtifacts && !state.leftFlashed;
  const canFlashRight =
    hasFlashableArtifacts && state.leftFlashed && !state.rightFlashed;

  if (canUseExternalArtifacts && hasCompleteArtifacts) {
    if (!state.leftFlashed) {
      return readiness("flash-left", "左側を書き込む", [], state, {
        canCommit,
        canBuild,
        canDownloadArtifact,
        canFlashLeft,
        canFlashRight,
      });
    }
    if (!state.rightFlashed) {
      return readiness("flash-right", "右側を書き込む", [], state, {
        canCommit,
        canBuild,
        canDownloadArtifact,
        canFlashLeft,
        canFlashRight,
      });
    }
    return readiness("done", "完了", [], state, {
      canCommit,
      canBuild,
      canDownloadArtifact,
      canFlashLeft,
      canFlashRight,
    });
  }

  if (!state.authenticated) {
    return readiness("connect-github", "GitHub で接続", ["GitHub 連携が必要です"], state, {
      canCommit,
      canBuild,
      canDownloadArtifact,
      canFlashLeft,
      canFlashRight,
    });
  }
  if (!state.repositorySelected) {
    return readiness("select-repository", "Firmware repository を選択", ["対象 repository が未選択です"], state, {
      canCommit,
      canBuild,
      canDownloadArtifact,
      canFlashLeft,
      canFlashRight,
    });
  }
  if (!state.branchSelected) {
    return readiness("select-repository", "Branch を入力", ["GitHub branch が未入力です"], state, {
      canCommit,
      canBuild,
      canDownloadArtifact,
      canFlashLeft,
      canFlashRight,
    });
  }
  if (!hasCommittedChanges && !state.filesLoaded) {
    return readiness("load-files", "Firmware files を読み込み", ["keymap / overlay が未読み込みです"], state, {
      canCommit,
      canBuild,
      canDownloadArtifact,
      canFlashLeft,
      canFlashRight,
    });
  }
  if (state.hasLocalChanges && !state.diffReviewed) {
    return readiness("review-diff", "変更内容を確認", ["diff の確認が必要です"], state, {
      canCommit,
      canBuild,
      canDownloadArtifact,
      canFlashLeft,
      canFlashRight,
    });
  }
  if (state.hasLocalChanges) {
    return readiness("commit", "Commit を作成", [], state, {
      canCommit,
      canBuild,
      canDownloadArtifact,
      canFlashLeft,
      canFlashRight,
    });
  }
  if (!hasCommittedChanges) {
    return readiness("edit", "設定を編集", ["commit する変更がありません"], state, {
      canCommit,
      canBuild,
      canDownloadArtifact,
      canFlashLeft,
      canFlashRight,
    });
  }
  if (!state.buildRunId || state.buildStatus === "idle") {
    return readiness("build", "Build を起動", [], state, {
      canCommit,
      canBuild,
      canDownloadArtifact,
      canFlashLeft,
      canFlashRight,
    });
  }
  if (state.buildStatus === "queued" || state.buildStatus === "in_progress" || state.buildStatus === "unknown") {
    return readiness("build", "Build 完了を待つ", ["GitHub Actions build が完了していません"], state, {
      canCommit,
      canBuild,
      canDownloadArtifact,
      canFlashLeft,
      canFlashRight,
    });
  }
  if (state.buildStatus === "failure" || state.buildStatus === "cancelled") {
    return readiness("build", "Build を確認", ["GitHub Actions build が成功していません"], state, {
      canCommit,
      canBuild,
      canDownloadArtifact,
      canFlashLeft,
      canFlashRight,
    });
  }
  if (!hasCompleteArtifacts) {
    return readiness("download-artifact", "Artifact を取得", ["left / right UF2 が揃っていません"], state, {
      canCommit,
      canBuild,
      canDownloadArtifact,
      canFlashLeft,
      canFlashRight,
    });
  }
  if (!state.leftFlashed) {
    return readiness("flash-left", "左側を書き込む", [], state, {
      canCommit,
      canBuild,
      canDownloadArtifact,
      canFlashLeft,
      canFlashRight,
    });
  }
  if (!state.rightFlashed) {
    return readiness("flash-right", "右側を書き込む", [], state, {
      canCommit,
      canBuild,
      canDownloadArtifact,
      canFlashLeft,
      canFlashRight,
    });
  }

  return readiness("done", "完了", [], state, {
    canCommit,
    canBuild,
    canDownloadArtifact,
    canFlashLeft,
    canFlashRight,
  });
}

export function canFlashFirmwareSide(readiness: FirmwareReleaseReadiness, side: FlashSide): boolean {
  return side === "left" ? readiness.canFlashLeft : readiness.canFlashRight;
}

function hasDistinctCompleteArtifacts(artifacts: ClassifiedUf2Artifacts): boolean {
  if (!artifacts.left || !artifacts.right || artifacts.left === artifacts.right) {
    return false;
  }
  return artifactBasename(artifacts.left) !== artifactBasename(artifacts.right);
}

function artifactBasename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function readiness(
  step: FirmwareReleaseStep,
  nextAction: string,
  blockers: string[],
  state: FirmwareReleaseState,
  gates: Pick<FirmwareReleaseReadiness, "canCommit" | "canBuild" | "canDownloadArtifact" | "canFlashLeft" | "canFlashRight">,
): FirmwareReleaseReadiness {
  return {
    step,
    nextAction,
    blockers,
    ...gates,
    complete: state.leftFlashed && state.rightFlashed && step === "done",
  };
}

function inferUf2Side(file: string): FlashSide | null {
  const filename = basename(file).toLowerCase();
  const tokens = filename
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

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
