import React from "react";
import type { GitHubFirmwareArtifacts } from "../lib/githubFirmwareClient";
import type { FirmwareBuildStatus, FlashSide } from "../lib/firmwareReleaseFlow";

export type BrowserFirmwareOperation =
  | "idle"
  | "oauth"
  | "load"
  | "commit-build"
  | "build"
  | "refresh-run"
  | "download-artifact"
  | "import-artifact"
  | "flash";

export type BrowserFirmwareArtifactSource = "github" | "folder" | null;

type StoredBrowserFirmwareSession = {
  branch: string;
  buildStatus: FirmwareBuildStatus;
  commitSha: string | null;
  commitUrl: string;
  leftFlashed: boolean;
  rightFlashed: boolean;
  runId: number | null;
  runUrl: string;
} | null;

type BrowserFirmwareReleaseState = {
  browserGithubToken: string;
  browserGithubUserCode: string;
  browserGithubVerificationUri: string;
  browserFirmwareBranch: string;
  browserFirmwareCommitSha: string | null;
  browserFirmwareCommitUrl: string;
  browserFirmwareRunId: number | null;
  browserFirmwareRunUrl: string;
  browserFirmwareLoadedHeadSha: string | null;
  browserFirmwareBuildStatus: FirmwareBuildStatus;
  browserFirmwareDiffReviewed: boolean;
  browserFirmwareFilesLoadedFromGitHub: boolean;
  browserFirmwareArtifacts: GitHubFirmwareArtifacts | null;
  browserFirmwareArtifactSource: BrowserFirmwareArtifactSource;
  browserFirmwareResetDone: Record<FlashSide, boolean>;
  browserFirmwareLeftFlashed: boolean;
  browserFirmwareRightFlashed: boolean;
  browserFirmwareOperation: BrowserFirmwareOperation;
};

type SetAction<Key extends keyof BrowserFirmwareReleaseState = keyof BrowserFirmwareReleaseState> = {
  type: "set";
  key: Key;
  value: React.SetStateAction<BrowserFirmwareReleaseState[Key]>;
};

function browserFirmwareReleaseReducer(
  state: BrowserFirmwareReleaseState,
  action: SetAction,
): BrowserFirmwareReleaseState {
  const current = state[action.key];
  const next =
    typeof action.value === "function"
      ? (action.value as (value: typeof current) => typeof current)(current)
      : action.value;
  return Object.is(current, next) ? state : { ...state, [action.key]: next };
}

export function useBrowserFirmwareRelease(storedSession: StoredBrowserFirmwareSession) {
  const [state, dispatch] = React.useReducer(
    browserFirmwareReleaseReducer,
    createInitialBrowserFirmwareReleaseState(storedSession),
  );

  const setBrowserGithubToken = useBrowserFirmwareReleaseSetter(dispatch, "browserGithubToken");
  const setBrowserGithubUserCode = useBrowserFirmwareReleaseSetter(dispatch, "browserGithubUserCode");
  const setBrowserGithubVerificationUri = useBrowserFirmwareReleaseSetter(dispatch, "browserGithubVerificationUri");
  const setBrowserFirmwareBranch = useBrowserFirmwareReleaseSetter(dispatch, "browserFirmwareBranch");
  const setBrowserFirmwareCommitSha = useBrowserFirmwareReleaseSetter(dispatch, "browserFirmwareCommitSha");
  const setBrowserFirmwareCommitUrl = useBrowserFirmwareReleaseSetter(dispatch, "browserFirmwareCommitUrl");
  const setBrowserFirmwareRunId = useBrowserFirmwareReleaseSetter(dispatch, "browserFirmwareRunId");
  const setBrowserFirmwareRunUrl = useBrowserFirmwareReleaseSetter(dispatch, "browserFirmwareRunUrl");
  const setBrowserFirmwareLoadedHeadSha = useBrowserFirmwareReleaseSetter(dispatch, "browserFirmwareLoadedHeadSha");
  const setBrowserFirmwareBuildStatus = useBrowserFirmwareReleaseSetter(dispatch, "browserFirmwareBuildStatus");
  const setBrowserFirmwareDiffReviewed = useBrowserFirmwareReleaseSetter(dispatch, "browserFirmwareDiffReviewed");
  const setBrowserFirmwareFilesLoadedFromGitHub = useBrowserFirmwareReleaseSetter(
    dispatch,
    "browserFirmwareFilesLoadedFromGitHub",
  );
  const setBrowserFirmwareArtifacts = useBrowserFirmwareReleaseSetter(dispatch, "browserFirmwareArtifacts");
  const setBrowserFirmwareArtifactSource = useBrowserFirmwareReleaseSetter(dispatch, "browserFirmwareArtifactSource");
  const setBrowserFirmwareResetDone = useBrowserFirmwareReleaseSetter(dispatch, "browserFirmwareResetDone");
  const setBrowserFirmwareLeftFlashed = useBrowserFirmwareReleaseSetter(dispatch, "browserFirmwareLeftFlashed");
  const setBrowserFirmwareRightFlashed = useBrowserFirmwareReleaseSetter(dispatch, "browserFirmwareRightFlashed");
  const setBrowserFirmwareOperation = useBrowserFirmwareReleaseSetter(dispatch, "browserFirmwareOperation");

  return {
    ...state,
    setBrowserGithubToken,
    setBrowserGithubUserCode,
    setBrowserGithubVerificationUri,
    setBrowserFirmwareBranch,
    setBrowserFirmwareCommitSha,
    setBrowserFirmwareCommitUrl,
    setBrowserFirmwareRunId,
    setBrowserFirmwareRunUrl,
    setBrowserFirmwareLoadedHeadSha,
    setBrowserFirmwareBuildStatus,
    setBrowserFirmwareDiffReviewed,
    setBrowserFirmwareFilesLoadedFromGitHub,
    setBrowserFirmwareArtifacts,
    setBrowserFirmwareArtifactSource,
    setBrowserFirmwareResetDone,
    setBrowserFirmwareLeftFlashed,
    setBrowserFirmwareRightFlashed,
    setBrowserFirmwareOperation,
  };
}

function useBrowserFirmwareReleaseSetter<Key extends keyof BrowserFirmwareReleaseState>(
  dispatch: React.Dispatch<SetAction>,
  key: Key,
): React.Dispatch<React.SetStateAction<BrowserFirmwareReleaseState[Key]>> {
  return React.useCallback((value) => dispatch({ type: "set", key, value } as SetAction), [dispatch, key]);
}

function createInitialBrowserFirmwareReleaseState(
  session: StoredBrowserFirmwareSession,
): BrowserFirmwareReleaseState {
  return {
    browserGithubToken: "",
    browserGithubUserCode: "",
    browserGithubVerificationUri: "",
    browserFirmwareBranch: session?.branch ?? "main",
    browserFirmwareCommitSha: session?.commitSha ?? null,
    browserFirmwareCommitUrl: session?.commitUrl ?? "",
    browserFirmwareRunId: session?.runId ?? null,
    browserFirmwareRunUrl: session?.runUrl ?? "",
    browserFirmwareLoadedHeadSha: null,
    browserFirmwareBuildStatus: session?.buildStatus ?? "idle",
    browserFirmwareDiffReviewed: false,
    browserFirmwareFilesLoadedFromGitHub: false,
    browserFirmwareArtifacts: null,
    browserFirmwareArtifactSource: null,
    browserFirmwareResetDone: { left: false, right: false },
    browserFirmwareLeftFlashed: session?.leftFlashed ?? false,
    browserFirmwareRightFlashed: session?.rightFlashed ?? false,
    browserFirmwareOperation: "idle",
  };
}
