import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  Bluetooth,
  BookOpen,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FolderOpen,
  Github,
  Loader2,
  MousePointer,
  Plus,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  Undo2,
  UploadCloud,
  Usb,
} from "lucide-react";
import { BindingForm, BindingKind, buildBindingFromForm, parseBindingForm } from "./lib/bindingForm";
import { bindingDisplay, formatBindingForDisplay } from "./lib/bindingDisplay";
import { summarizeChangedLines } from "./lib/diff";
import {
  applyDirectFirmwareComboDiffsToSource,
  applyDirectFirmwareKeyDiffsToSource,
  diffDirectCombosAgainstFirmware,
  diffDirectKeymapAgainstFirmware,
  firmwareCombosToStudioSet,
  studioKeymapToParsedKeymap,
  type DirectFirmwareComboDiff,
  type DirectFirmwareKeyDiff,
  type StudioComboSet,
  type StudioKeymap,
} from "./lib/directKeymap";
import {
  canFlashFirmwareSide,
  deriveFirmwareReleaseReadiness,
  type FirmwareBuildStatus,
  type FirmwareReleaseReadiness,
  type FirmwareReleaseStep,
  type FlashSide,
  classifyUf2Artifacts,
} from "./lib/firmwareReleaseFlow";
import { loadFixtureProject } from "./lib/fixtureProject";
import {
  readBrowserFirmwareSession,
  writeBrowserFirmwareSession,
} from "./lib/browserFirmwareSession";
import { writeBrowserUf2ToDirectoryHandle } from "./lib/browserUf2Write";
import {
  commitGitHubFirmwareFiles,
  dispatchGitHubFirmwareBuild,
  downloadGitHubFirmwareArtifacts,
  findGitHubFirmwareBuildRun,
  readGitHubFirmwareProjectSnapshot,
  type GitHubArtifactUf2,
  type GitHubFirmwareArtifacts,
} from "./lib/githubFirmwareClient";
import {
  formatGitHubRepositoryRef,
  parseGitHubRepositoryRef,
  type GitHubRepositoryRef,
} from "./lib/githubFirmware";
import { hasGitHubOAuthScope, pollGitHubDeviceToken, requestGitHubDeviceCode } from "./lib/githubDeviceFlow";
import { assertUf2BootloaderDirectory } from "./lib/uf2Bootloader";
import {
  BLUETOOTH_ACTION_CHOICES,
  BLUETOOTH_PROFILE_CHOICES,
  KEY_CHOICE_GROUPS,
  KeyChoice,
  KeyChoiceGroup,
  LAYER_CHOICES,
  MODIFIER_CHOICES,
  MOUSE_CHOICES,
  SPECIAL_BINDING_CHOICES,
} from "./lib/keycodeCatalog";
import {
  KeymapCombo,
  KeymapLayer,
  KeymapParseWarning,
  LayerReferenceSite,
  addCombo,
  addLayer,
  deleteCombo,
  deleteLayer,
  findLayerReferenceSites,
  findOverlayLayerReferenceSites,
  nextLayerId,
  parseKeymap,
  updateCombo,
  updateLayerBinding,
} from "./lib/keymapParser";
import {
  KEY_UNIT,
  LAYOUT_HEIGHT,
  LAYOUT_WIDTH,
  kobitoKeyPhysicalLayout,
  matrixBasePath,
  rightMirrorTransform,
  thumbBasePath,
  trackballBasePath,
  trackballs,
} from "./lib/kobitokeyPhysicalLayout";
import {
  TrackballSettings,
  parseTrackballSettings,
  updateBlockNumberSetting,
} from "./lib/trackballParser";
import type { ProjectFiles } from "./lib/projectFiles";
import {
  connectWebStudioDevice,
  disconnectWebStudioDevice,
  DirectTrackballSettings,
  addWebStudioCombo,
  readWebTrackballSettings,
  readWebStudioCombos,
  removeWebStudioCombo,
  setWebStudioCombo,
  StudioConnectionKind,
  supportsWebStudioConnection,
  writeWebStudioKey,
  writeWebTrackballSettings,
} from "./lib/zmkStudioWeb";
import "./styles.css";

type FileDiff = {
  filename: string;
  lines: string[];
};

type FirmwareBuildStart = {
  committed: boolean;
  commitOutput?: string;
  pushOutput?: string;
  buildOutput: string;
};

type FirmwareBuildCheck = {
  ok: boolean;
  items: FirmwareBuildCheckItem[];
};

type FirmwareBuildCheckItem = {
  label: string;
  ok: boolean;
  detail: string;
};

type FirmwareUf2Targets = {
  left?: string;
  right?: string;
  unknown: string[];
  manifestPath?: string;
};

type FirmwareFlashTargets = {
  uf2Files: string[];
  bootloaderVolumes: string[];
  leftUf2?: string;
  rightUf2?: string;
  unknownUf2: string[];
  manifestPath?: string;
};

type StudioPort = {
  path: string;
  label: string;
  manufacturer?: string;
  product?: string;
  serialNumber?: string;
  portKind: string;
};

type StudioBluetoothDevice = {
  deviceId: string;
  localName?: string;
  label: string;
};

type DirectCombo = KeymapCombo & {
  index: number;
  requirePriorIdleMs: number;
  layerMask: number;
  slowRelease: boolean;
};

type DirectComboSource = "none" | "device" | "firmware";

type EditorMode = "firmware" | "direct";
type BrowserFirmwareOperation =
  | "idle"
  | "oauth"
  | "load"
  | "commit-build"
  | "build"
  | "refresh-run"
  | "download-artifact"
  | "import-artifact"
  | "flash";
type BrowserFirmwareArtifactSource = "github" | "folder" | null;
type FlashConfirmationKind = "write";
type FlashConfirmationRequest = {
  id: number;
  side: FlashSide;
  kind: FlashConfirmationKind;
  uf2Name: string;
  volumeName?: string;
};
type StudioConnectionState = "disconnected" | "connecting" | "connected" | "error";
type DirectConnectionIssue = {
  summary: string;
  detail: string;
  actions: string[];
  rawMessage: string;
};
type DirectKeyWriteFeedback = {
  kind: "idle" | "writing" | "success" | "error";
  message: string;
  binding?: string;
};
type ToastKind = "info" | "writing" | "success" | "error";
type ToastMessage = {
  id: number;
  kind: ToastKind;
  message: string;
};
type DirectKeyDraft = {
  layerIndex: number;
  keyIndex: number;
  from: string;
  to: string;
};
type StudioConnectionSession = {
  kind: StudioConnectionKind;
  label: string;
  deviceName: string;
  serialNumber: string;
  lockState: string;
  keymap: StudioKeymap;
};
type DesktopStudioConnection = {
  kind: StudioConnectionKind;
  transport: string;
  portPath?: string;
  keymap: StudioKeymap;
};

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
      startIn?: FileSystemDirectoryHandle | "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

const DEFAULT_PROJECT_ROOT = "";
const DEFAULT_FIRMWARE_REPO_URL = "https://github.com/juichi50iii/KobitoKey_QWERTY";
const USER_GUIDE_URL = "https://s-hiraoku.github.io/kobitokey-studio/user-guide/";
const MOBILE_UNSUPPORTED_QUERY = "(max-width: 767px)";
const ENABLE_LAYER_STRUCTURE_EDITING = true;

function useMobileUnsupported() {
  const [isMobileUnsupported, setIsMobileUnsupported] = React.useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(MOBILE_UNSUPPORTED_QUERY).matches;
  });

  React.useEffect(() => {
    const query = window.matchMedia(MOBILE_UNSUPPORTED_QUERY);
    const update = () => setIsMobileUnsupported(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isMobileUnsupported;
}

function MobileUnsupportedScreen() {
  return (
    <main className="mobile-unsupported" aria-labelledby="mobile-unsupported-title">
      <section className="mobile-unsupported-card">
        <div className="mobile-unsupported-icon" aria-hidden="true">
          <Smartphone size={24} />
        </div>
        <p className="eyebrow">KobitoKey Studio</p>
        <h1 id="mobile-unsupported-title">PC ブラウザでご利用ください</h1>
        <p>
          このエディタはキーボード接続と広い編集画面が必要なため、初版では PC ブラウザからの利用を想定しています。
        </p>
        <p className="mobile-unsupported-note">PC の Chrome または Edge でアクセスしてください。</p>
      </section>
    </main>
  );
}

function App() {
  const isMobileUnsupported = useMobileUnsupported();
  const isDesktopRuntime = isTauriRuntime();
  const storedBrowserFirmwareSession = React.useMemo(
    () => readBrowserFirmwareSession(typeof window === "undefined" ? null : window.localStorage),
    [],
  );
  const [editorMode, setEditorMode] = React.useState<EditorMode>(() => initialEditorMode());
  const [projectRoot, setProjectRoot] = React.useState(DEFAULT_PROJECT_ROOT);
  const [firmwareRepoUrl, setFirmwareRepoUrl] = React.useState(storedBrowserFirmwareSession?.repoUrl ?? DEFAULT_FIRMWARE_REPO_URL);
  const [files, setFiles] = React.useState<ProjectFiles | null>(null);
  const folderInputRef = React.useRef<HTMLInputElement | null>(null);
  const fixtureLoadRequestRef = React.useRef(0);
  const [projectDirHandle, setProjectDirHandle] = React.useState<FileSystemDirectoryHandle | null>(null);
  const [studioPorts, setStudioPorts] = React.useState<StudioPort[]>([]);
  const [selectedStudioPort, setSelectedStudioPort] = React.useState("");
  const [studioBluetoothDevices, setStudioBluetoothDevices] = React.useState<StudioBluetoothDevice[]>([]);
  const [selectedBluetoothDevice, setSelectedBluetoothDevice] = React.useState("");
  const [studioConnectionKind, setStudioConnectionKind] = React.useState<StudioConnectionKind>("usb");
  const [studioConnectionState, setStudioConnectionState] = React.useState<StudioConnectionState>("disconnected");
  const [studioConnectionError, setStudioConnectionError] = React.useState<DirectConnectionIssue | null>(null);
  const [directKeymap, setDirectKeymap] = React.useState<StudioKeymap | null>(null);
  const [directKeyDrafts, setDirectKeyDrafts] = React.useState<Record<string, DirectKeyDraft>>({});
  const [directTrackball, setDirectTrackball] = React.useState<DirectTrackballSettings | null>(null);
  const [directTrackballError, setDirectTrackballError] = React.useState("");
  const [directCombos, setDirectCombos] = React.useState<DirectCombo[]>([]);
  const [directComboDrafts, setDirectComboDrafts] = React.useState<Record<string, DirectCombo>>({});
  const [directComboSource, setDirectComboSource] = React.useState<DirectComboSource>("none");
  const [directComboError, setDirectComboError] = React.useState("");
  const [directMaxCombos, setDirectMaxCombos] = React.useState(0);
  const [bindingDraft, setBindingDraft] = React.useState("");
  const pendingFirmwareBindingRef = React.useRef("");
  const [directKeyWriteFeedback, setDirectKeyWriteFeedback] = React.useState<DirectKeyWriteFeedback>({
    kind: "idle",
    message: "",
  });
  const [toast, setToast] = React.useState<ToastMessage | null>(null);
  const directWriteRequestRef = React.useRef(0);
  const githubDeviceFlowAbortRef = React.useRef<AbortController | null>(null);
  const browserFirmwareOperationRef = React.useRef<BrowserFirmwareOperation>("idle");
  const browserFirmwareRepoBranchInitializedRef = React.useRef(false);
  const browserFirmwareArtifactFolderHandleRef = React.useRef<FileSystemDirectoryHandle | null>(null);
  const browserFirmwareResetDoneRef = React.useRef<Record<FlashSide, boolean>>({ left: false, right: false });
  const flashConfirmationResolverRef = React.useRef<((confirmed: boolean) => void) | null>(null);
  const [savedKeymap, setSavedKeymap] = React.useState("");
  const [savedLeftOverlay, setSavedLeftOverlay] = React.useState("");
  const [savedRightOverlay, setSavedRightOverlay] = React.useState("");
  const [activeLayerIndex, setActiveLayerIndex] = React.useState(0);
  const [selectedKeyIndex, setSelectedKeyIndex] = React.useState(0);
  const [selectedComboId, setSelectedComboId] = React.useState<string | null>(null);
  const [workbenchTab, setWorkbenchTab] = React.useState<WorkbenchTabId>(() => initialWorkbenchTab());
  const [lastEditWorkbenchTab, setLastEditWorkbenchTab] = React.useState<WorkbenchTabId>(() => {
    const initial = initialWorkbenchTab();
    return initial === "build" ? "combos" : initial;
  });
  const [status, setStatus] = React.useState("fixture を読み込み中");
  const [fixtureLoading, setFixtureLoading] = React.useState(true);
  const [fixtureError, setFixtureError] = React.useState("");
  const [buildStatus, setBuildStatus] = React.useState("GitHub Actions 未確認");
  const [firmwareFlashError, setFirmwareFlashError] = React.useState("");
  const [firmwareBuildCheck, setFirmwareBuildCheck] = React.useState<FirmwareBuildCheck | null>(null);
  const [uf2Files, setUf2Files] = React.useState<string[]>([]);
  const [bootloaderVolumes, setBootloaderVolumes] = React.useState<string[]>([]);
  const [selectedUf2, setSelectedUf2] = React.useState("");
  const [selectedVolume, setSelectedVolume] = React.useState("");
  const [flashSide, setFlashSide] = React.useState<FlashSide>("left");
  const [firmwareUf2Targets, setFirmwareUf2Targets] = React.useState<FirmwareUf2Targets>({ unknown: [] });
  const [browserGithubToken, setBrowserGithubToken] = React.useState("");
  const [browserGithubUserCode, setBrowserGithubUserCode] = React.useState("");
  const [browserGithubVerificationUri, setBrowserGithubVerificationUri] = React.useState("");
  const [browserFirmwareBranch, setBrowserFirmwareBranch] = React.useState(storedBrowserFirmwareSession?.branch ?? "main");
  const [browserFirmwareCommitSha, setBrowserFirmwareCommitSha] = React.useState<string | null>(storedBrowserFirmwareSession?.commitSha ?? null);
  const [browserFirmwareCommitUrl, setBrowserFirmwareCommitUrl] = React.useState(storedBrowserFirmwareSession?.commitUrl ?? "");
  const [browserFirmwareRunId, setBrowserFirmwareRunId] = React.useState<number | null>(storedBrowserFirmwareSession?.runId ?? null);
  const [browserFirmwareRunUrl, setBrowserFirmwareRunUrl] = React.useState(storedBrowserFirmwareSession?.runUrl ?? "");
  const [browserFirmwareLoadedHeadSha, setBrowserFirmwareLoadedHeadSha] = React.useState<string | null>(null);
  const [browserFirmwareBuildStatus, setBrowserFirmwareBuildStatus] = React.useState<FirmwareBuildStatus>(storedBrowserFirmwareSession?.buildStatus ?? "idle");
  const [browserFirmwareDiffReviewed, setBrowserFirmwareDiffReviewed] = React.useState(false);
  const [browserFirmwareFilesLoadedFromGitHub, setBrowserFirmwareFilesLoadedFromGitHub] = React.useState(false);
  const [browserFirmwareArtifacts, setBrowserFirmwareArtifacts] = React.useState<GitHubFirmwareArtifacts | null>(null);
  const [browserFirmwareArtifactSource, setBrowserFirmwareArtifactSource] = React.useState<BrowserFirmwareArtifactSource>(null);
  const [browserFirmwareResetDone, setBrowserFirmwareResetDone] = React.useState<Record<FlashSide, boolean>>({ left: false, right: false });
  const [browserFirmwareLeftFlashed, setBrowserFirmwareLeftFlashed] = React.useState(storedBrowserFirmwareSession?.leftFlashed ?? false);
  const [browserFirmwareRightFlashed, setBrowserFirmwareRightFlashed] = React.useState(storedBrowserFirmwareSession?.rightFlashed ?? false);
  const [browserFirmwareOperation, setBrowserFirmwareOperation] = React.useState<BrowserFirmwareOperation>("idle");
  const [flashConfirmation, setFlashConfirmation] = React.useState<FlashConfirmationRequest | null>(null);
  const canUseWebUsb = supportsWebStudioConnection("usb");
  const canUseWebBluetooth = supportsWebStudioConnection("bluetooth");
  const firmwareRepoLabel = React.useMemo(() => formatFirmwareRepoLabel(firmwareRepoUrl), [firmwareRepoUrl]);
  const browserFirmwareRepoRef = React.useMemo(
    () => parseGitHubRepositoryRef(firmwareRepoUrl),
    [firmwareRepoUrl],
  );
  const firmwareRepoHref = browserFirmwareRepoRef
    ? `https://github.com/${browserFirmwareRepoRef.owner}/${browserFirmwareRepoRef.repo}`
    : DEFAULT_FIRMWARE_REPO_URL;
  const browserFirmwareBranchRef = browserFirmwareBranch.trim();

  React.useEffect(() => {
    const requestId = fixtureLoadRequestRef.current + 1;
    fixtureLoadRequestRef.current = requestId;
    void loadFixture(requestId);
    return () => {
      if (fixtureLoadRequestRef.current === requestId) {
        fixtureLoadRequestRef.current += 1;
      }
    };
  }, []);

  const isDirectMode = editorMode === "direct";
  const activeKeymapSource = React.useMemo(
    () => files?.keymap ?? "",
    [files?.keymap],
  );
  const firmwareParsedKeymap = React.useMemo(() => parseKeymap(activeKeymapSource), [activeKeymapSource]);
  const directDraftKeymap = React.useMemo(
    () => (directKeymap ? applyDirectKeyDraftsToKeymap(directKeymap, directKeyDrafts) : null),
    [directKeyDrafts, directKeymap],
  );
  const directKeyDraftList = React.useMemo(
    () =>
      Object.values(directKeyDrafts).sort(
        (left, right) => left.layerIndex - right.layerIndex || left.keyIndex - right.keyIndex,
      ),
    [directKeyDrafts],
  );
  const directParsedKeymap = React.useMemo(
    () =>
      directDraftKeymap
        ? studioKeymapToParsedKeymap(
            directDraftKeymap,
            directComboSource === "device"
              ? applyDirectComboDrafts(directCombos, directComboDrafts)
              : firmwareParsedKeymap.combos,
          )
        : firmwareParsedKeymap,
    [directComboDrafts, directComboSource, directCombos, directDraftKeymap, firmwareParsedKeymap],
  );
  const parsedKeymap = isDirectMode ? directParsedKeymap : firmwareParsedKeymap;
  const layers = parsedKeymap.layers;
  const combos = parsedKeymap.combos;
  const keymapParseWarnings = isDirectMode ? [] : firmwareParsedKeymap.warnings;
  const activeCombos = combos;
  const displayedDirectComboSource: DirectComboSource = directComboSource === "device" ? "device" : "firmware";
  const displayedDirectMaxCombos = directKeymap ? directMaxCombos : activeCombos.length;
  const directFirmwareDiffs = React.useMemo(
    () => diffDirectKeymapAgainstFirmware(directKeymap, firmwareParsedKeymap),
    [directKeymap, firmwareParsedKeymap],
  );
  const directFirmwareComboDiffs = React.useMemo(
    () =>
      directKeymap && directComboSource === "device"
        ? diffDirectCombosAgainstFirmware(directCombos, firmwareParsedKeymap.combos)
        : [],
    [directComboSource, directCombos, directKeymap, firmwareParsedKeymap.combos],
  );
  const activeLayer = layers[activeLayerIndex] ?? layers[0];
  const selectedBinding = activeLayer?.bindings[selectedKeyIndex] ?? "";
  const hasPendingFirmwareKeyDraft =
    !isDirectMode && bindingDraft.trim().length > 0 && bindingDraft.trim() !== selectedBinding.trim();
  const selectedDeviceBinding =
    isDirectMode ? directKeymap?.layers[activeLayerIndex]?.bindings[selectedKeyIndex] ?? selectedBinding : selectedBinding;
  const selectedDirectKeyDraft = directKeyDrafts[directKeyDraftKey(activeLayerIndex, selectedKeyIndex)];
  const activeLayerDraftKeyIndexes = React.useMemo(
    () =>
      new Set(
        directKeyDraftList
          .filter((draft) => draft.layerIndex === activeLayerIndex)
          .map((draft) => draft.keyIndex),
      ),
    [activeLayerIndex, directKeyDraftList],
  );
  const showDirectEmptyState = isDirectMode && !directKeymap;
  const showFirmwareLoadingState = !isDirectMode && fixtureLoading && !files && workbenchTab !== "build";
  const showFirmwareEmptyState =
    !isDirectMode && !fixtureLoading && Boolean(fixtureError) && !files && workbenchTab !== "build";
  const canEditLayerStructure = ENABLE_LAYER_STRUCTURE_EDITING && !isDirectMode && files !== null;
  const activeLayerReferences = React.useMemo(
    () => [
      ...findLayerReferenceSites(parsedKeymap, activeLayerIndex),
      ...findOverlayLayerReferenceSites({
        leftOverlay: files?.leftOverlay ?? "",
        rightOverlay: files?.rightOverlay ?? "",
        targetLayerIndex: activeLayerIndex,
      }),
    ],
    [activeLayerIndex, files?.leftOverlay, files?.rightOverlay, parsedKeymap],
  );
  const activeLayerDeletionBlockReason = activeLayerIndex === layers.length - 1 && activeLayerReferences.length
    ? `参照中のため削除できません: ${formatLayerReferenceSummary(activeLayerReferences)}`
    : "";
  const canDeleteActiveLayer =
    canEditLayerStructure &&
    Boolean(activeLayer) &&
    layers.length > 1 &&
    activeLayerIndex === layers.length - 1 &&
    activeLayerReferences.length === 0;
  const selectedCombos = React.useMemo(
    () => activeCombos.filter((combo) => combo.keyPositions.includes(selectedKeyIndex)),
    [activeCombos, selectedKeyIndex],
  );
  const selectedCombo = React.useMemo(
    () => activeCombos.find((combo) => combo.id === selectedComboId),
    [activeCombos, selectedComboId],
  );
  const trackball = React.useMemo(
    () => parseTrackballSettings(files?.leftOverlay ?? "", files?.rightOverlay ?? ""),
    [files?.leftOverlay, files?.rightOverlay],
  );
  const keymapDiff = React.useMemo(
    () =>
      [
        fileDiff("KobitoKey.keymap", savedKeymap, files?.keymap ?? ""),
        fileDiff("KobitoKey_left.overlay", savedLeftOverlay, files?.leftOverlay ?? ""),
        fileDiff("KobitoKey_right.overlay", savedRightOverlay, files?.rightOverlay ?? ""),
      ].filter((diff) => diff.lines.length > 0),
    [files?.keymap, files?.leftOverlay, files?.rightOverlay, savedKeymap, savedLeftOverlay, savedRightOverlay],
  );
  const browserFirmwareReadiness = React.useMemo(
    () =>
      deriveFirmwareReleaseReadiness({
        authenticated: browserGithubToken.trim().length > 0,
        branchSelected: browserFirmwareBranchRef.length > 0,
        repositorySelected: Boolean(browserFirmwareRepoRef),
        filesLoaded: isDesktopRuntime ? Boolean(files) : browserFirmwareFilesLoadedFromGitHub,
        hasLocalChanges: keymapDiff.length > 0,
        diffReviewed: browserFirmwareDiffReviewed,
        commitSha: browserFirmwareCommitSha,
        buildRunId: browserFirmwareRunId === null ? null : String(browserFirmwareRunId),
        buildStatus: browserFirmwareBuildStatus,
        artifactFiles: browserFirmwareArtifacts?.files.map((file) => file.name) ?? [],
        externalArtifactsReady: browserFirmwareArtifactSource === "folder",
        artifactTargets: browserFirmwareArtifacts?.targets,
        leftFlashed: browserFirmwareLeftFlashed,
        rightFlashed: browserFirmwareRightFlashed,
      }),
    [
      browserFirmwareArtifacts,
      browserFirmwareArtifactSource,
      browserFirmwareBuildStatus,
      browserFirmwareCommitSha,
      browserFirmwareDiffReviewed,
      browserFirmwareFilesLoadedFromGitHub,
      browserFirmwareLeftFlashed,
      browserFirmwareRepoRef,
      browserFirmwareRightFlashed,
      browserFirmwareRunId,
      browserFirmwareBranchRef.length,
      browserGithubToken,
      files,
      isDesktopRuntime,
      keymapDiff.length,
    ],
  );
  const canAttemptBrowserFirmwareArtifactDownload = Boolean(
    browserFirmwareRepoRef &&
      browserFirmwareRunId !== null &&
      browserFirmwareCommitSha &&
      browserGithubToken.trim() &&
      browserFirmwareBranchRef.trim(),
  );
  React.useEffect(() => {
    setBindingDraft(selectedBinding);
    pendingFirmwareBindingRef.current = selectedBinding;
  }, [activeLayerIndex, editorMode, selectedBinding, selectedKeyIndex]);

  React.useEffect(() => {
    setBrowserFirmwareDiffReviewed(false);
  }, [files?.keymap, files?.leftOverlay, files?.rightOverlay]);

  React.useEffect(() => {
    if (!browserFirmwareRepoBranchInitializedRef.current) {
      browserFirmwareRepoBranchInitializedRef.current = true;
      return;
    }
    setBrowserFirmwareFilesLoadedFromGitHub(false);
    setBrowserFirmwareDiffReviewed(false);
    setBrowserFirmwareCommitSha(null);
    setBrowserFirmwareCommitUrl("");
    setBrowserFirmwareLoadedHeadSha(null);
    setBrowserFirmwareRunId(null);
    setBrowserFirmwareRunUrl("");
    setBrowserFirmwareBuildStatus("idle");
    setBrowserFirmwareArtifacts(null);
    setBrowserFirmwareArtifactSource(null);
    setFirmwareFlashError("");
    clearBrowserFirmwareResetDone();
    setBrowserFirmwareLeftFlashed(false);
    setBrowserFirmwareRightFlashed(false);
  }, [browserFirmwareBranch, firmwareRepoUrl]);

  React.useEffect(() => {
    setDirectKeyWriteFeedback((current) => (current.kind === "writing" ? current : { kind: "idle", message: "" }));
  }, [activeLayerIndex, selectedKeyIndex]);

  React.useEffect(() => {
    if (!toast || toast.kind === "writing") {
      return;
    }
    const timeout = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, toast.kind === "error" ? 5200 : 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  React.useEffect(() => {
    return () => {
      flashConfirmationResolverRef.current?.(false);
      flashConfirmationResolverRef.current = null;
    };
  }, []);

  function setBrowserFirmwareSideResetDone(side: FlashSide, done: boolean) {
    const next = { ...browserFirmwareResetDoneRef.current, [side]: done };
    browserFirmwareResetDoneRef.current = next;
    setBrowserFirmwareResetDone(next);
  }

  function clearBrowserFirmwareResetDone() {
    const next = { left: false, right: false };
    browserFirmwareResetDoneRef.current = next;
    setBrowserFirmwareResetDone(next);
  }

  React.useEffect(() => {
    if (isDesktopRuntime) {
      return;
    }
    writeBrowserFirmwareSession(
      {
        branch: browserFirmwareBranch,
        buildStatus: browserFirmwareBuildStatus,
        commitSha: browserFirmwareCommitSha,
        commitUrl: browserFirmwareCommitUrl,
        leftFlashed: browserFirmwareLeftFlashed,
        repoUrl: firmwareRepoUrl,
        rightFlashed: browserFirmwareRightFlashed,
        runId: browserFirmwareRunId,
        runUrl: browserFirmwareRunUrl,
      },
      window.localStorage,
    );
  }, [
      browserFirmwareBranch,
      browserFirmwareBranchRef.length,
    browserFirmwareBuildStatus,
    browserFirmwareCommitSha,
    browserFirmwareCommitUrl,
    browserFirmwareLeftFlashed,
    browserFirmwareRightFlashed,
    browserFirmwareRunId,
    browserFirmwareRunUrl,
    firmwareRepoUrl,
    isDesktopRuntime,
  ]);

  React.useEffect(() => {
    if (
      isDesktopRuntime ||
      !browserGithubToken.trim() ||
      !browserFirmwareRepoRef ||
      !browserFirmwareCommitSha ||
      browserFirmwareBuildStatus === "success" ||
      browserFirmwareBuildStatus === "failure" ||
      browserFirmwareBuildStatus === "cancelled"
    ) {
      return;
    }

    let cancelled = false;
    async function pollBrowserFirmwareRun() {
      if (!browserFirmwareRepoRef || !browserFirmwareCommitSha) {
        return;
      }
      try {
        const run = await findGitHubFirmwareBuildRun(
          browserFirmwareRepoRef,
          browserFirmwareBranchRef,
          browserFirmwareCommitSha,
          { token: browserGithubToken },
        );
        if (cancelled) {
          return;
        }
        if (!run) {
          setBuildStatus("対象 commit の GitHub Actions run を待っています");
          return;
        }
        setBrowserFirmwareRunId(run.id);
        setBrowserFirmwareRunUrl(run.htmlUrl);
        setBrowserFirmwareBuildStatus(mapGitHubRunStatus(run.status, run.conclusion));
        setBuildStatus(`GitHub Actions: ${run.status} / ${run.conclusion ?? "pending"} / run ${run.id}`);
      } catch (error) {
        if (!cancelled) {
          setBuildStatus(`GitHub Actions 自動確認失敗: ${formatError(error)}`);
        }
      }
    }

    void pollBrowserFirmwareRun();
    const interval = window.setInterval(() => {
      void pollBrowserFirmwareRun();
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    browserFirmwareBranchRef,
    browserFirmwareBuildStatus,
    browserFirmwareCommitSha,
    browserFirmwareRepoRef,
    browserGithubToken,
    isDesktopRuntime,
  ]);

  const saveProjectFiles = React.useCallback(async () => {
    if (!files) {
      setStatus("保存対象のファイルがありません");
      return;
    }

    // Browser path: try the FS Access API directory handle first so the
    // edit lands back in the user's original folder.
    if (!files.keymapPath) {
      if (projectDirHandle) {
        try {
          await writeProjectToDirectoryHandle(projectDirHandle, files);
          setSavedKeymap(files.keymap);
          setSavedLeftOverlay(files.leftOverlay);
          setSavedRightOverlay(files.rightOverlay);
          setStatus(`フォルダ "${projectDirHandle.name}" に保存しました`);
          return;
        } catch (error) {
          // Permission revoked, handle stale, etc. — fall through to download.
          setStatus(`直接書き込みに失敗したためダウンロードに切り替えます: ${String(error)}`);
        }
      }
      downloadText("KobitoKey.keymap", files.keymap);
      downloadText("KobitoKey_left.overlay", files.leftOverlay);
      downloadText("KobitoKey_right.overlay", files.rightOverlay);
      setSavedKeymap(files.keymap);
      setSavedLeftOverlay(files.leftOverlay);
      setSavedRightOverlay(files.rightOverlay);
      setStatus("ブラウザ表示のため firmware ファイル一式をダウンロードしました");
      return;
    }

    if (!files.leftOverlayPath || !files.rightOverlayPath) {
      setStatus("overlay の保存先パスが不足しています");
      return;
    }

    try {
      await invoke("write_text_file", { path: files.keymapPath, contents: files.keymap });
      await invoke("write_text_file", { path: files.leftOverlayPath, contents: files.leftOverlay });
      await invoke("write_text_file", { path: files.rightOverlayPath, contents: files.rightOverlay });
      setSavedKeymap(files.keymap);
      setSavedLeftOverlay(files.leftOverlay);
      setSavedRightOverlay(files.rightOverlay);
      setStatus("変更ファイルを保存しました");
    } catch (error) {
      setStatus(`保存失敗: ${formatError(error)}`);
    }
  }, [files, projectDirHandle]);

  // Ctrl/Cmd+S saves the firmware project, matching desktop-app expectations.
  // Only active in Firmware mode with a loaded project; otherwise the browser's
  // default save dialog is left alone.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isSaveChord = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "s";
      if (!isSaveChord) {
        return;
      }
      if (editorMode !== "firmware" || !files) {
        return;
      }
      event.preventDefault();
      void saveProjectFiles();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editorMode, files, saveProjectFiles]);

  function showToast(kind: ToastKind, message: string) {
    setToast({ id: Date.now(), kind, message });
  }

  async function loadFixture(requestId = fixtureLoadRequestRef.current + 1) {
    fixtureLoadRequestRef.current = requestId;
    setFixtureLoading(true);
    setFixtureError("");
    setStatus("fixture を読み込み中");
    try {
      const project = await loadFixtureProject(fetch);
      if (fixtureLoadRequestRef.current !== requestId) {
        return;
      }
      setFiles(project);
      setSavedKeymap(project.keymap);
      setSavedLeftOverlay(project.leftOverlay);
      setSavedRightOverlay(project.rightOverlay);
      setStatus("fixture を表示中");
    } catch (error) {
      if (fixtureLoadRequestRef.current !== requestId) {
        return;
      }
      const message = `fixture 読み込み失敗: ${formatError(error)}`;
      setFiles(null);
      setSavedKeymap("");
      setSavedLeftOverlay("");
      setSavedRightOverlay("");
      setFixtureError(message);
      setStatus(message);
    } finally {
      if (fixtureLoadRequestRef.current === requestId) {
        setFixtureLoading(false);
      }
    }
  }

  async function loadProject() {
    const validationError = validateProjectRoot(projectRoot);
    if (validationError) {
      setStatus(validationError);
      return;
    }

    try {
      const project = await invoke<ProjectFiles>("read_kobitokey_project", { root: projectRoot });
      setFiles(project);
      setSavedKeymap(project.keymap);
      setSavedLeftOverlay(project.leftOverlay);
      setSavedRightOverlay(project.rightOverlay);
      setFixtureError("");
      setStatus("ローカルプロジェクトを読み込みました");
    } catch (error) {
      setStatus(`読み込み失敗: ${String(error)}`);
    }
  }

  async function chooseProjectFolder() {
    // Tauri (desktop): native folder picker via @tauri-apps/plugin-dialog
    if (isDesktopRuntime) {
      try {
        const selected = await open({
          defaultPath: projectRoot,
          directory: true,
          multiple: false,
          title: "KobitoKey_QWERTY フォルダを選択",
        });
        if (typeof selected === "string") {
          setProjectRoot(selected);
          setStatus("フォルダを選択しました");
        }
      } catch (error) {
        setStatus(`フォルダ選択でエラー: ${String(error)}`);
      }
      return;
    }

    // Browser: try the File System Access API (Chrome/Edge).
    const picker = (window as unknown as { showDirectoryPicker?: (options?: { mode?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
    if (typeof picker === "function") {
      try {
        const handle = await picker.call(window, { mode: "readwrite" });
        await loadProjectFromDirectoryHandle(handle);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus(`フォルダ選択でエラー: ${String(error)}`);
      }
      return;
    }

    // Fallback: trigger a hidden <input webkitdirectory>.
    folderInputRef.current?.click();
  }

  async function loadProjectFromDirectoryHandle(handle: FileSystemDirectoryHandle) {
    try {
      const project = await readProjectFromDirectoryHandle(handle);
      setProjectRoot(handle.name);
      setProjectDirHandle(handle);
      setFiles(project);
      setSavedKeymap(project.keymap);
      setSavedLeftOverlay(project.leftOverlay);
      setSavedRightOverlay(project.rightOverlay);
      setFixtureError("");
      setStatus(`フォルダ "${handle.name}" を読み込みました`);
    } catch (error) {
      setStatus(`読み込み失敗: ${String(error)}`);
    }
  }

  async function loadProjectFromFileList(fileList: FileList) {
    try {
      const project = await readProjectFromFileList(fileList);
      setProjectRoot(project.rootLabel);
      setProjectDirHandle(null);
      setFiles(project.files);
      setSavedKeymap(project.files.keymap);
      setSavedLeftOverlay(project.files.leftOverlay);
      setSavedRightOverlay(project.files.rightOverlay);
      setFixtureError("");
      setStatus(`フォルダ "${project.rootLabel}" を読み込みました(直接書き戻し不可・保存時はダウンロードになります)`);
    } catch (error) {
      setStatus(`読み込み失敗: ${String(error)}`);
    }
  }

  function resetFirmwareEdits() {
    if (!files || keymapDiff.length === 0) {
      setStatus("リセットする firmware 編集はありません");
      return;
    }

    setFiles({
      ...files,
      keymap: savedKeymap,
      leftOverlay: savedLeftOverlay,
      rightOverlay: savedRightOverlay,
    });
    setActiveLayerIndex(0);
    setSelectedKeyIndex(0);
    setSelectedComboId(null);
    setBrowserFirmwareDiffReviewed(false);
    setBrowserFirmwareCommitSha(null);
    setBrowserFirmwareCommitUrl("");
    setBrowserFirmwareRunId(null);
    setBrowserFirmwareRunUrl("");
    setBrowserFirmwareBuildStatus("idle");
    setBrowserFirmwareArtifacts(null);
    setBrowserFirmwareArtifactSource(null);
    clearBrowserFirmwareResetDone();
    setBrowserFirmwareLeftFlashed(false);
    setBrowserFirmwareRightFlashed(false);
    setBuildStatus("編集を読み込み時点に戻しました");
    setStatus("firmware 編集を読み込み時点に戻しました");
  }

  function selectFirmwareWorkbenchTab(tab: WorkbenchTabId) {
    setWorkbenchTab(tab);
    if (tab !== "build") {
      setLastEditWorkbenchTab(tab);
    }
  }

  function openFirmwareBuildFlash() {
    commitPendingFirmwareKeyDraft();
    if (workbenchTab !== "build") {
      setLastEditWorkbenchTab(workbenchTab);
    }
    setWorkbenchTab("build");
  }

  function closeFirmwareBuildFlash() {
    setWorkbenchTab(lastEditWorkbenchTab === "build" ? "combos" : lastEditWorkbenchTab);
  }

  function toggleFirmwareBuildFlash() {
    if (workbenchTab === "build") {
      closeFirmwareBuildFlash();
      return;
    }
    openFirmwareBuildFlash();
  }

  function commitPendingFirmwareKeyDraft() {
    if (isDirectMode || !files || !activeLayer) {
      return;
    }

    const nextBinding = pendingFirmwareBindingRef.current.trim();
    if (nextBinding === selectedBinding) {
      return;
    }

    setFiles((current) => {
      if (!current) {
        return current;
      }
      const currentLayer = parseKeymap(current.keymap).layers[activeLayerIndex];
      if (!currentLayer) {
        return current;
      }
      return {
        ...current,
        keymap: updateLayerBinding(current.keymap, currentLayer, selectedKeyIndex, nextBinding),
      };
    });
    setBindingDraft(nextBinding);
    setStatus(`Layer ${activeLayerIndex} / Key ${selectedKeyIndex + 1} の未適用キー編集を Build & Flash 前に保存しました`);
  }

  async function applyBinding(nextBinding: string) {
    const trimmedBinding = nextBinding.trim();
    if (isDirectMode) {
      stageDirectBinding(trimmedBinding);
      return;
    }

    if (!files || !activeLayer) {
      return;
    }
    if (trimmedBinding === selectedBinding.trim()) {
      setBindingDraft(trimmedBinding);
      setStatus(`Layer ${activeLayerIndex} / Key ${selectedKeyIndex + 1} は変更なしです`);
      return;
    }

    setFiles((current) => {
      if (!current) {
        return current;
      }
      const currentLayer = parseKeymap(current.keymap).layers[activeLayerIndex];
      if (!currentLayer) {
        return current;
      }
      return {
        ...current,
        keymap: updateLayerBinding(current.keymap, currentLayer, selectedKeyIndex, trimmedBinding),
      };
    });
    setBindingDraft(trimmedBinding);
    setStatus(`Layer ${activeLayerIndex} / Key ${selectedKeyIndex + 1} の編集を保存しました`);
  }

  function stageDirectBinding(nextBinding: string) {
    if (!directKeymap) {
      const message = "Direct Mode で device を読み込んでから編集してください";
      showToast("error", message);
      setStatus(message);
      return;
    }

    const from = directKeymap.layers[activeLayerIndex]?.bindings[selectedKeyIndex] ?? "";
    const draftKey = directKeyDraftKey(activeLayerIndex, selectedKeyIndex);
    const trimmedBinding = nextBinding.trim();
    setBindingDraft(trimmedBinding);
    setDirectKeyDrafts((current) => {
      const next = { ...current };
      if (trimmedBinding === from) {
        delete next[draftKey];
      } else {
        next[draftKey] = {
          layerIndex: activeLayerIndex,
          keyIndex: selectedKeyIndex,
          from,
          to: trimmedBinding,
        };
      }
      return next;
    });
    const message =
      trimmedBinding === from
        ? `Layer ${activeLayerIndex} / Key ${selectedKeyIndex + 1} の下書きを取り消しました`
        : `Layer ${activeLayerIndex} / Key ${selectedKeyIndex + 1} を書き込み予定に追加しました`;
    setDirectKeyWriteFeedback({ kind: "idle", message });
    showToast(trimmedBinding === from ? "info" : "success", message);
    setStatus(message);
  }

  function applyDirectFirmwareDiffs(targetDiffs: DirectFirmwareKeyDiff[] = directFirmwareDiffs) {
    if (!files || targetDiffs.length === 0) {
      return;
    }

    setFiles((current) =>
      current
        ? {
            ...current,
            keymap: applyDirectFirmwareKeyDiffsToSource(current.keymap, targetDiffs),
          }
        : current,
    );
    setStatus(`Direct keymap の差分 ${targetDiffs.length} keys を firmware keymap に取り込みました`);
  }

  function createLayer() {
    if (!canEditLayerStructure || !files) {
      return;
    }

    const index = layers.length;
    const id = nextLayerId(layers);
    const label = `Layer ${index}`;
    setFiles((current) =>
      current
        ? {
            ...current,
            keymap: addLayer(current.keymap, {
              id,
              label,
              bindings: Array.from({ length: kobitoKeyPhysicalLayout.length }, () => "&trans"),
            }),
          }
        : current,
    );
    setActiveLayerIndex(index);
    setSelectedKeyIndex(0);
    setSelectedComboId(null);
    setStatus(`${label} を追加しました`);
  }

  function duplicateLayer() {
    if (!canEditLayerStructure || !files || !activeLayer) {
      return;
    }

    const id = nextLayerId(layers, `${activeLayer.id}_copy`);
    const label = `${activeLayer.label} Copy`;
    setFiles((current) =>
      current
        ? {
            ...current,
            keymap: addLayer(current.keymap, {
              id,
              label,
              bindings: activeLayer.bindings,
            }),
          }
        : current,
    );
    setActiveLayerIndex(layers.length);
    setSelectedKeyIndex(0);
    setSelectedComboId(null);
    setStatus(`${label} を複製しました`);
  }

  function removeActiveLayer() {
    if (!canEditLayerStructure || !files || !activeLayer) {
      return;
    }

    if (layers.length <= 1) {
      setStatus("最後の layer は削除できません");
      return;
    }

    if (activeLayerIndex !== layers.length - 1) {
      setStatus("layer 削除は番号参照のずれを避けるため最後の layer のみ対応しています");
      return;
    }

    if (activeLayerReferences.length > 0) {
      setStatus(`参照中の layer は削除できません: ${formatLayerReferenceSummary(activeLayerReferences)}`);
      return;
    }

    setFiles((current) => {
      if (!current) {
        return current;
      }
      const currentLayer = parseKeymap(current.keymap).layers[activeLayerIndex];
      if (!currentLayer) {
        return current;
      }
      return {
        ...current,
        keymap: deleteLayer(current.keymap, currentLayer),
      };
    });
    setActiveLayerIndex(Math.max(0, layers.length - 2));
    setSelectedKeyIndex(0);
    setSelectedComboId(null);
    setStatus(`${activeLayer.label} を削除しました`);
  }

  function applyDirectFirmwareComboDiffs(targetDiffs: DirectFirmwareComboDiff[] = directFirmwareComboDiffs) {
    if (!files || directComboSource !== "device" || targetDiffs.length === 0) {
      return;
    }

    setFiles((current) =>
      current
        ? {
            ...current,
            keymap: applyDirectFirmwareComboDiffsToSource(current.keymap, targetDiffs),
          }
        : current,
    );
    setStatus(`Direct Combo の差分 ${targetDiffs.length} 件を firmware keymap に取り込みました`);
  }

  async function detectStudioPorts() {
    const ports = await invoke<StudioPort[]>("list_studio_ports");
    setStudioPorts(ports);
    setSelectedStudioPort((current) => current || ports[0]?.path || "");
    return ports;
  }

  async function detectStudioBluetoothDevices() {
    const devices = await invoke<StudioBluetoothDevice[]>("list_studio_bluetooth_devices");
    setStudioBluetoothDevices(devices);
    setSelectedBluetoothDevice((current) => current || devices[0]?.deviceId || "");
    return devices;
  }

  async function refreshStudioPorts() {
    if (!isDesktopRuntime) {
      setStatus("ブラウザの接続ダイアログを開きます。表示された device を選択してください。");
      await connectStudioDevice(studioConnectionKind);
      return;
    }

    try {
      const [portsResult, bluetoothResult] = await Promise.allSettled([
        detectStudioPorts(),
        detectStudioBluetoothDevices(),
      ]);
      const portCount = portsResult.status === "fulfilled" ? portsResult.value.length : 0;
      const bluetoothCount = bluetoothResult.status === "fulfilled" ? bluetoothResult.value.length : 0;
      const errors = [portsResult, bluetoothResult]
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => formatError(result.reason));
      setStatus(
        errors.length > 0
          ? `Studio device candidates: USB ${portCount} / Bluetooth ${bluetoothCount} (${errors.join(" / ")})`
          : `Studio device candidates: USB ${portCount} / Bluetooth ${bluetoothCount}`,
      );
    } catch (error) {
      setStatus(`Studio device 検出失敗: ${String(error)}`);
    }
  }

  function applyStudioConnection(session: StudioConnectionSession) {
    setDirectKeymap(session.keymap);
    setDirectKeyDrafts({});
    setDirectTrackball(null);
    setDirectTrackballError("");
    setDirectCombos([]);
    setDirectComboDrafts({});
    setDirectComboSource("none");
    setDirectComboError("");
    setDirectMaxCombos(0);
    directWriteRequestRef.current += 1;
    setDirectKeyWriteFeedback({ kind: "idle", message: "" });
    setSelectedStudioPort(session.label);
    if (session.kind === "bluetooth") {
      setSelectedBluetoothDevice(session.label);
    }
    setStudioConnectionKind(session.kind);
    setStudioConnectionState("connected");
    setStudioConnectionError(null);
    setEditorMode("direct");
    setActiveLayerIndex(0);
    setSelectedKeyIndex(0);
    setSelectedComboId(null);
    setStatus(`${session.deviceName || "ZMK device"} に ${session.kind.toUpperCase()} で接続しました`);
  }

  async function connectStudioDevice(kind: StudioConnectionKind) {
    setStudioConnectionKind(kind);
    setStudioConnectionState("connecting");
    setStudioConnectionError(null);

    if (!isDesktopRuntime) {
      try {
        const session = await connectWebStudioDevice(kind);
        applyStudioConnection({
          kind: session.kind,
          label: session.label,
          deviceName: session.keymap.deviceName,
          serialNumber: session.keymap.serialNumber,
          lockState: session.keymap.lockState,
          keymap: session.keymap,
        });
      } catch (error) {
        const issue = formatDirectConnectionIssue({
          kind,
          runtime: "web",
          error,
          prefix: kind === "usb" ? "Web Serial 接続失敗" : "Web Bluetooth 接続失敗",
        });
        setStudioConnectionState("error");
        setStudioConnectionError(issue);
        setStatus(formatDirectConnectionStatus(issue));
      }
      return;
    }

    let portPath = selectedStudioPort;
    if (kind === "usb") {
      try {
        const ports = await detectStudioPorts();
        const selectedUsbPort = ports.find((port) => port.path === selectedStudioPort && port.portKind === "usb");
        portPath = selectedUsbPort?.path || ports.find((port) => port.portKind === "usb")?.path || ports[0]?.path || "";
        setSelectedStudioPort(portPath);
      } catch (error) {
        const issue = formatDirectConnectionIssue({
          kind,
          runtime: "desktop",
          error,
          prefix: "Studio device 検出失敗",
        });
        setStudioConnectionState("error");
        setStudioConnectionError(issue);
        setStatus(formatDirectConnectionStatus(issue));
        return;
      }
    }

    if (kind === "usb" && !portPath) {
      const issue = formatDirectConnectionIssue({
        kind,
        runtime: "desktop",
        error: "Studio device が見つかりません。",
        prefix: "Direct USB 接続失敗",
      });
      setStudioConnectionState("error");
      setStudioConnectionError(issue);
      setStatus(formatDirectConnectionStatus(issue));
      return;
    }

    if (kind === "bluetooth") {
      let bluetoothDeviceId = selectedBluetoothDevice;
      if (!selectedBluetoothDevice) {
        try {
          const devices = await detectStudioBluetoothDevices();
          bluetoothDeviceId = devices[0]?.deviceId || "";
          setSelectedBluetoothDevice(bluetoothDeviceId);
        } catch {
          // Let the backend return the actionable Bluetooth error message.
        }
      }
      portPath = bluetoothDeviceId;
    }

    try {
      const session = await invoke<DesktopStudioConnection>("connect_studio_device", {
        kind,
        portPath: portPath || null,
      });
      applyStudioConnection({
        kind: session.kind,
        label: session.portPath || session.transport,
        deviceName: session.keymap.deviceName,
        serialNumber: session.keymap.serialNumber,
        lockState: session.keymap.lockState,
        keymap: session.keymap,
      });
    } catch (error) {
      const issue = formatDirectConnectionIssue({
        kind,
        runtime: "desktop",
        error,
        prefix: `Direct ${kind.toUpperCase()} 接続失敗`,
      });
      setStudioConnectionState("error");
      setStudioConnectionError(issue);
      setStatus(formatDirectConnectionStatus(issue));
    }
  }

  async function readStudioDevice(kind: StudioConnectionKind = studioConnectionKind) {
    await connectStudioDevice(kind);
  }

  async function disconnectStudioDevice() {
    if (!isDesktopRuntime) {
      try {
        disconnectWebStudioDevice();
      } catch {
        // best-effort
      }
    } else {
      try {
        await invoke("disconnect_studio_device");
      } catch {
        // command may not exist yet on older builds; safe to ignore
      }
    }
    setDirectKeymap(null);
    setDirectKeyDrafts({});
    setDirectTrackball(null);
    setDirectTrackballError("");
    setDirectCombos([]);
    setDirectComboSource("none");
    setDirectMaxCombos(0);
    directWriteRequestRef.current += 1;
    setDirectKeyWriteFeedback({ kind: "idle", message: "" });
    setStudioConnectionState("disconnected");
    setStudioConnectionError(null);
    setStatus("device を切断しました");
  }

  async function writeDirectKeyDrafts(targetDrafts: DirectKeyDraft[] = directKeyDraftList) {
    if (targetDrafts.length === 0) {
      const message = "未書き込みの key 変更はありません";
      showToast("info", message);
      setStatus(message);
      return;
    }

    const requestId = ++directWriteRequestRef.current;
    let nextKeymap = directKeymap;
    if (!nextKeymap) {
      const message = "Direct Mode で device を読み込んでから書き込んでください";
      setDirectKeyWriteFeedback({ kind: "error", message });
      showToast("error", message);
      setStatus(message);
      return;
    }

    if (!isDesktopRuntime) {
      if (!supportsWebStudioConnection(studioConnectionKind)) {
        const message = "このブラウザは現在の Direct 接続方式に対応していません。";
        setDirectKeyWriteFeedback({ kind: "error", message });
        showToast("error", message);
        setStatus(message);
        return;
      }
    }

    if (isDesktopRuntime && !selectedStudioPort) {
      const message = "Direct Mode で接続中の device がありません";
      setDirectKeyWriteFeedback({ kind: "error", message });
      showToast("error", message);
      setStatus(message);
      return;
    }

    const writtenDrafts: DirectKeyDraft[] = [];

    try {
      for (const [index, draft] of targetDrafts.entries()) {
        const directLayer = nextKeymap.layers[draft.layerIndex];
        if (!directLayer) {
          throw new Error(`Layer ${draft.layerIndex} が見つかりません`);
        }
        setDirectKeyWriteFeedback({
          kind: "writing",
          message: `${index + 1}/${targetDrafts.length}: Layer ${draft.layerIndex} / Key ${draft.keyIndex + 1} を書き込み中です`,
          binding: draft.to,
        });
        showToast(
          "writing",
          `${index + 1}/${targetDrafts.length}: Layer ${draft.layerIndex} / Key ${draft.keyIndex + 1} を書き込み中です`,
        );
        nextKeymap = await writeDirectKeyToDevice(directLayer.id, draft.keyIndex, draft.to);
        if (requestId !== directWriteRequestRef.current) return;
        writtenDrafts.push(draft);
      }
      setDirectKeymap(nextKeymap);
      setDirectKeyDrafts((current) => {
        const next = { ...current };
        for (const draft of targetDrafts) {
          delete next[directKeyDraftKey(draft.layerIndex, draft.keyIndex)];
        }
        return next;
      });
      setBindingDraft(nextKeymap.layers[activeLayerIndex]?.bindings[selectedKeyIndex] ?? "");
      const message = `Key 変更 ${targetDrafts.length} 件を実機へ書き込みました`;
      setDirectKeyWriteFeedback({ kind: "success", message });
      showToast("success", message);
      setStatus(message);
    } catch (error) {
      if (requestId !== directWriteRequestRef.current) return;
      if (writtenDrafts.length > 0) {
        setDirectKeymap(nextKeymap);
        setDirectKeyDrafts((current) => {
          const next = { ...current };
          for (const draft of writtenDrafts) {
            delete next[directKeyDraftKey(draft.layerIndex, draft.keyIndex)];
          }
          return next;
        });
        setBindingDraft(nextKeymap.layers[activeLayerIndex]?.bindings[selectedKeyIndex] ?? "");
      }
      const message =
        writtenDrafts.length > 0
          ? `${isDesktopRuntime ? "Direct" : "Web Direct"} 書き込み失敗: ${formatError(error)}。${writtenDrafts.length}/${targetDrafts.length} 件は反映済みです`
          : `${isDesktopRuntime ? "Direct" : "Web Direct"} 書き込み失敗: ${formatError(error)}`;
      setDirectKeyWriteFeedback({ kind: "error", message });
      showToast("error", message);
      setStatus(message);
    }
  }

  async function writeDirectKeyToDevice(layerId: number, keyPosition: number, binding: string): Promise<StudioKeymap> {
    if (!isDesktopRuntime) {
      return writeWebStudioKey(layerId, keyPosition, binding);
    }

    return invoke<StudioKeymap>("write_studio_key", {
      kind: studioConnectionKind,
      portPath: selectedStudioPort,
      layerId,
      keyPosition,
      binding,
    });
  }

  function discardDirectKeyDrafts(targetDrafts: DirectKeyDraft[] = directKeyDraftList) {
    if (targetDrafts.length === 0) {
      return;
    }
    setDirectKeyDrafts((current) => {
      const next = { ...current };
      for (const draft of targetDrafts) {
        delete next[directKeyDraftKey(draft.layerIndex, draft.keyIndex)];
      }
      return next;
    });
    setBindingDraft(directKeymap?.layers[activeLayerIndex]?.bindings[selectedKeyIndex] ?? "");
    const message = `Key 変更 ${targetDrafts.length} 件を破棄しました`;
    setDirectKeyWriteFeedback({ kind: "idle", message });
    showToast("info", message);
    setStatus(message);
  }

  async function refreshDirectTrackballSettings(
    kind: StudioConnectionKind = studioConnectionKind,
    portPath: string = selectedStudioPort,
    options: { silent?: boolean } = {},
  ) {
    if (!directKeymap && !portPath && isDesktopRuntime) {
      if (!options.silent) {
        setStatus("Direct Mode で接続中の device がありません");
      }
      return;
    }

    try {
      setDirectTrackballError("");
      const settings = isDesktopRuntime
        ? await invoke<DirectTrackballSettings>("read_studio_trackball_settings", {
            kind,
            portPath: portPath || null,
          })
        : await readWebTrackballSettings();
      setDirectTrackball(settings);
      if (!options.silent) {
        setStatus(`Trackball 設定を ${kind.toUpperCase()} から読み込みました`);
      }
    } catch (error) {
      const errorMessage = formatError(error);
      setDirectTrackballError(errorMessage);
      setDirectTrackball(null);
      if (!options.silent) {
        setStatus(`Trackball 読み込み失敗: ${errorMessage}`);
      }
    }
  }

  async function saveDirectTrackballSettings(settings: DirectTrackballSettings) {
    if (!directKeymap && isDesktopRuntime) {
      setStatus("Direct Mode で接続中の device がありません");
      return;
    }

    try {
      const nextSettings = isDesktopRuntime
        ? await invoke<DirectTrackballSettings>("write_studio_trackball_settings", {
            kind: studioConnectionKind,
            portPath: selectedStudioPort || null,
            settings,
          })
        : await writeWebTrackballSettings(settings);
      setDirectTrackball(nextSettings);
      setDirectTrackballError("");
      setStatus("Trackball 設定を実機へ保存し、再読み込みしました");
    } catch (error) {
      const errorMessage = formatError(error);
      setDirectTrackballError(errorMessage);
      setStatus(`Trackball 保存失敗: ${errorMessage}`);
    }
  }

  async function refreshDirectCombos(
    kind: StudioConnectionKind = studioConnectionKind,
    portPath: string = selectedStudioPort,
    options: { silent?: boolean } = {},
  ) {
    if (!portPath && isDesktopRuntime) {
      if (!options.silent) {
        setStatus("Direct Mode で接続中の device がありません");
      }
      return;
    }

    setDirectComboError("");
    if (!options.silent) {
      setStatus("Combo を実機から読み込み中...");
    }

    try {
      const comboSet = isDesktopRuntime
        ? await invoke<StudioComboSet>("read_studio_combos", {
            kind,
            portPath: portPath || null,
          })
        : await readWebStudioCombos();
      applyDirectComboSet(comboSet, "device");
      if (!options.silent) {
        setStatus(`Combo ${comboSet.combos.length} 件を実機から読み込みました`);
      }
    } catch (error) {
      const errorMessage = formatError(error);
      setDirectComboError(errorMessage);
      const fallbackApplied = applyFirmwareComboFallback();
      if (!options.silent) {
        setStatus(
          fallbackApplied
            ? `Direct Combo 読み込み失敗: ${errorMessage}。Firmware keymap の Combo を表示しています。`
            : `Combo 読み込み失敗: ${errorMessage}`,
        );
      }
    }
  }

  async function createDirectCombo() {
    const keyPositions = defaultComboKeyPositions(selectedKeyIndex);
    await writeDirectComboCommand("add_studio_combo", {
      combo: {
        binding: "&kp ESC",
        keyPositions,
        timeoutMs: 50,
        requirePriorIdleMs: 0,
        layerMask: 0xffffffff,
        slowRelease: false,
      },
    });
  }

  async function saveDirectCombo(combo: KeymapCombo, input: ComboFormValue) {
    const keyPositions = parseDisplayKeyPositions(input.keyPositions);
    if (keyPositions.length < 2) {
      setStatus("combo には2つ以上のキーが必要です");
      return;
    }

    const directCombo = directCombos.find((candidate) => candidate.id === combo.id);
    if (!directCombo) {
      setStatus("Direct Combo の対象が見つかりません");
      return;
    }

    await writeDirectComboCommand("set_studio_combo", {
      index: directCombo.index,
      combo: {
        binding: input.binding,
        keyPositions,
        timeoutMs: input.timeoutMs,
        requirePriorIdleMs: directCombo.requirePriorIdleMs,
        layerMask: directCombo.layerMask,
        slowRelease: directCombo.slowRelease,
      },
    });
  }

  function stageDirectCombo(combo: KeymapCombo, input: ComboFormValue, options: { silent?: boolean } = {}) {
    const keyPositions = parseDisplayKeyPositions(input.keyPositions);
    if (keyPositions.length < 2) {
      if (!options.silent) {
        setStatus("combo には2つ以上のキーが必要です");
      }
      return;
    }

    const directCombo = directCombos.find((candidate) => candidate.id === combo.id);
    if (!directCombo) {
      if (!options.silent) {
        setStatus("Direct Combo の対象が見つかりません");
      }
      return;
    }

    const nextCombo: DirectCombo = {
      ...directCombo,
      binding: input.binding,
      keyPositions,
      timeoutMs: input.timeoutMs,
    };
    setDirectComboDrafts((current) => {
      if (sameDirectComboDraft(directCombo, nextCombo)) {
        if (!current[combo.id]) {
          return current;
        }
        const next = { ...current };
        delete next[combo.id];
        return next;
      }
      if (current[combo.id] && sameDirectComboDraft(current[combo.id], nextCombo)) {
        return current;
      }
      return {
        ...current,
        [combo.id]: nextCombo,
      };
    });
    setSelectedComboId(combo.id);
    if (!options.silent) {
      setStatus(`${combo.id} の編集内容を書き込み予定に追加しました`);
    }
  }

  async function removeDirectCombo(combo: KeymapCombo) {
    const directCombo = directCombos.find((candidate) => candidate.id === combo.id);
    if (!directCombo) {
      setStatus("Direct Combo の対象が見つかりません");
      return;
    }

    await writeDirectComboCommand("remove_studio_combo", {
      index: directCombo.index,
    });
  }

  async function writeDirectComboCommand(command: string, payload: Record<string, unknown>) {
    if (!directKeymap || (isDesktopRuntime && !selectedStudioPort)) {
      setStatus("Direct Mode で接続中の device がありません");
      return;
    }
    if (directComboSource === "firmware") {
      setStatus("Firmware keymap 参照中のため、Direct Combo 書き込みはできません。");
      return;
    }

    try {
      const comboSet = isDesktopRuntime
        ? await invoke<StudioComboSet>(command, {
            kind: studioConnectionKind,
            portPath: selectedStudioPort || null,
            ...payload,
          })
        : await writeWebDirectComboCommand(command, payload);
      applyDirectComboSet(comboSet, "device");
      setDirectComboError("");
      setStatus("Combo を実機へ保存し、再読み込みしました");
    } catch (error) {
      const errorMessage = formatError(error);
      setDirectComboError(errorMessage);
      setStatus(`Direct Combo 書き込み失敗: ${errorMessage}`);
    }
  }

  async function writeWebDirectComboCommand(command: string, payload: Record<string, unknown>): Promise<StudioComboSet> {
    if (command === "add_studio_combo") {
      return addWebStudioCombo(payload.combo as Parameters<typeof addWebStudioCombo>[0]);
    }
    if (command === "set_studio_combo") {
      return setWebStudioCombo(payload.index as number, payload.combo as Parameters<typeof setWebStudioCombo>[1]);
    }
    if (command === "remove_studio_combo") {
      return removeWebStudioCombo(payload.index as number);
    }
    throw new Error(`Unsupported Web Direct Combo command: ${command}`);
  }

  function applyDirectComboSet(comboSet: StudioComboSet, source: DirectComboSource) {
    const nextCombos = comboSet.combos.map((combo) => ({
      id: combo.id,
      index: combo.index,
      binding: combo.binding,
      keyPositions: combo.keyPositions,
      timeoutMs: combo.timeoutMs,
      requirePriorIdleMs: combo.requirePriorIdleMs,
      layerMask: combo.layerMask,
      slowRelease: combo.slowRelease,
      blockStart: combo.index,
      blockEnd: combo.index,
    }));
    setDirectCombos(nextCombos);
    setDirectComboDrafts({});
    setDirectComboSource(source);
    if (source === "device") {
      setDirectComboError("");
    }
    setDirectMaxCombos(comboSet.maxCombos);
    setSelectedComboId((current) => current && nextCombos.some((combo) => combo.id === current) ? current : null);
  }

  function applyFirmwareComboFallback(): boolean {
    if (firmwareParsedKeymap.combos.length === 0) {
      return false;
    }
    applyDirectComboSet(firmwareCombosToStudioSet(firmwareParsedKeymap.combos), "firmware");
    return true;
  }

  function saveCombo(combo: KeymapCombo, input: ComboFormValue) {
    if (!files) {
      return;
    }

    const keyPositions = parseDisplayKeyPositions(input.keyPositions);
    if (keyPositions.length < 2) {
      setStatus("combo には2つ以上のキーが必要です");
      return;
    }

    setFiles((current) => {
      if (!current) {
        return current;
      }
      const currentCombo = parseKeymap(current.keymap).combos.find((candidate) => candidate.id === combo.id);
      if (!currentCombo) {
        return current;
      }
      return {
        ...current,
        keymap: updateCombo(current.keymap, currentCombo, {
          id: combo.id,
          binding: input.binding,
          keyPositions,
          timeoutMs: input.timeoutMs,
        }),
      };
    });
    setSelectedComboId(combo.id);
    setStatus(`${combo.id} の編集を保存しました`);
  }

  function createCombo() {
    if (!files) {
      return;
    }

    const id = nextComboId(combos);
    const keyPositions = defaultComboKeyPositions(selectedKeyIndex);
    setFiles((current) =>
      current
        ? {
            ...current,
            keymap: addCombo(current.keymap, {
              id,
              binding: "&kp ESC",
              keyPositions,
              timeoutMs: 50,
            }),
          }
        : current,
    );
    setSelectedComboId(id);
    setStatus(`${id} を追加しました`);
  }

  function removeCombo(combo: KeymapCombo) {
    if (!files) {
      return;
    }

    setFiles((current) => {
      if (!current) {
        return current;
      }
      const currentCombo = parseKeymap(current.keymap).combos.find((candidate) => candidate.id === combo.id);
      if (!currentCombo) {
        return current;
      }
      return {
        ...current,
        keymap: deleteCombo(current.keymap, currentCombo),
      };
    });
    setSelectedComboId(null);
    setStatus(`${combo.id} を削除しました`);
  }

  function applyTrackballSettings(nextSettings: EditableTrackballSettings) {
    if (!files) {
      return;
    }

    let leftOverlay = files.leftOverlay;
    let rightOverlay = files.rightOverlay;

    leftOverlay = updateOptionalBlockNumberSetting(leftOverlay, "tb_left", "cpi", nextSettings.leftCpi);
    rightOverlay = updateOptionalBlockNumberSetting(rightOverlay, "tb_right", "cpi", nextSettings.rightCpi);
    leftOverlay = updateOptionalBlockNumberSetting(leftOverlay, "pointer_accel", "min-factor", nextSettings.pointerMinFactor);
    leftOverlay = updateOptionalBlockNumberSetting(leftOverlay, "pointer_accel", "max-factor", nextSettings.pointerMaxFactor);
    leftOverlay = updateOptionalBlockNumberSetting(
      leftOverlay,
      "pointer_accel",
      "speed-threshold",
      nextSettings.pointerSpeedThreshold,
    );
    leftOverlay = updateOptionalBlockNumberSetting(
      leftOverlay,
      "pointer_accel",
      "acceleration-exponent",
      nextSettings.pointerAccelerationExponent,
    );
    leftOverlay = updateOptionalBlockNumberSetting(
      leftOverlay,
      "pointer_accel_right",
      "min-factor",
      nextSettings.rightPointerMinFactor,
    );
    leftOverlay = updateOptionalBlockNumberSetting(
      leftOverlay,
      "pointer_accel_right",
      "max-factor",
      nextSettings.rightPointerMaxFactor,
    );
    leftOverlay = updateOptionalBlockNumberSetting(
      leftOverlay,
      "pointer_accel_right",
      "speed-threshold",
      nextSettings.rightPointerSpeedThreshold,
    );
    leftOverlay = updateOptionalBlockNumberSetting(
      leftOverlay,
      "pointer_accel_right",
      "acceleration-exponent",
      nextSettings.rightPointerAccelerationExponent,
    );
    leftOverlay = updateOptionalBlockNumberSetting(leftOverlay, "gesture_keybind", "threshold", nextSettings.gestureThreshold);
    leftOverlay = updateOptionalBlockNumberSetting(leftOverlay, "tab_keybind", "threshold", nextSettings.tabThreshold);
    leftOverlay = updateOptionalBlockNumberSetting(leftOverlay, "desktop_keybind", "threshold", nextSettings.desktopThreshold);

    setFiles((current) =>
      current
        ? {
            ...current,
            leftOverlay,
            rightOverlay,
          }
        : current,
    );
    setStatus("トラックボール編集を保存しました");
  }

  async function triggerBuild() {
    try {
      await invoke<string>("trigger_github_build", { root: projectRoot, repoUrl: firmwareRepoUrl });
      setBuildStatus(`build workflow を起動しました: ${firmwareRepoLabel}`);
    } catch (error) {
      setBuildStatus(`起動失敗: ${String(error)}`);
    }
  }

  async function checkFirmwareBuildReady(): Promise<FirmwareBuildCheck | null> {
    try {
      const result = await invoke<FirmwareBuildCheck>("check_firmware_build_ready", {
        root: projectRoot,
        repoUrl: firmwareRepoUrl,
      });
      setFirmwareBuildCheck(result);
      const failed = result.items.filter((item) => !item.ok);
      setBuildStatus(
        result.ok
          ? "Build 前提チェック OK"
          : `Build 前提チェック NG: ${failed.map((item) => item.label).join(", ")}`,
      );
      return result;
    } catch (error) {
      setBuildStatus(`Build 前提チェック失敗: ${formatError(error)}`);
      return null;
    }
  }

  async function savePushAndTriggerBuild() {
    if (!files) {
      setBuildStatus("保存対象のファイルがありません");
      return;
    }
    if (!files.keymapPath) {
      setBuildStatus("Save & Build はローカル firmware repository を開いているデスクトップ版で使えます");
      return;
    }

    try {
      const check = await checkFirmwareBuildReady();
      if (!check?.ok) {
        return;
      }
      const result = await invoke<FirmwareBuildStart>("save_commit_push_and_trigger_build", {
        root: projectRoot,
        repoUrl: firmwareRepoUrl,
        keymap: files.keymap,
        leftOverlay: files.leftOverlay,
        rightOverlay: files.rightOverlay,
      });
      setSavedKeymap(files.keymap);
      setSavedLeftOverlay(files.leftOverlay);
      setSavedRightOverlay(files.rightOverlay);
      setBuildStatus(
        result.committed
          ? `保存、commit、push、build 起動が完了しました: ${firmwareRepoLabel}`
          : `変更なしのため commit は省略し、build workflow を起動しました: ${firmwareRepoLabel}`,
      );
    } catch (error) {
      setBuildStatus(`保存/commit/push/build 失敗: ${formatError(error)}`);
    }
  }

  async function refreshBuildStatus() {
    try {
      const output = await invoke<string>("latest_github_run", { root: projectRoot, repoUrl: firmwareRepoUrl });
      setBuildStatus(formatRunStatus(output));
    } catch (error) {
      setBuildStatus(`確認失敗: ${String(error)}`);
    }
  }

  async function downloadArtifacts() {
    try {
      const output = await invoke<string>("download_latest_artifact", { root: projectRoot, repoUrl: firmwareRepoUrl });
      const {
        bootloaderVolumes: nextVolumes,
        firmwareUf2Targets: targets,
      } = await readFlashTargets();
      setFirmwareFlashError("");
      setBuildStatus(
        output ||
          `最新成功 build の artifact を取得しました。left ${targets.left ? "OK" : "未検出"} / right ${
            targets.right ? "OK" : "未検出"
          } / bootloader ${nextVolumes.length} 件${targets.manifestPath ? " / manifest OK" : ""}`,
      );
    } catch (error) {
      setBuildStatus(`artifact 取得失敗: ${String(error)}`);
    }
  }

  function requireBrowserFirmwareRef(): GitHubRepositoryRef | null {
    if (!browserFirmwareRepoRef) {
      setBuildStatus("GitHub repository URL を owner/repo 形式で指定してください");
      return null;
    }
    if (!browserGithubToken.trim()) {
      setBuildStatus("GitHub token を入力してください");
      return null;
    }
    if (!browserFirmwareBranchRef) {
      setBuildStatus("GitHub branch を入力してください");
      return null;
    }
    return browserFirmwareRepoRef;
  }

  function beginBrowserFirmwareOperation(operation: BrowserFirmwareOperation): boolean {
    if (browserFirmwareOperationRef.current !== "idle") {
      setBuildStatus(`${browserFirmwareOperationLabel(browserFirmwareOperationRef.current)} が完了してから次の操作をしてください`);
      return false;
    }
    browserFirmwareOperationRef.current = operation;
    setBrowserFirmwareOperation(operation);
    return true;
  }

  function endBrowserFirmwareOperation(operation: BrowserFirmwareOperation) {
    if (browserFirmwareOperationRef.current === operation) {
      browserFirmwareOperationRef.current = "idle";
      setBrowserFirmwareOperation("idle");
    }
  }

  async function connectBrowserGithub() {
    if (!beginBrowserFirmwareOperation("oauth")) return;
    const clientId = githubOAuthClientId();
    if (!clientId) {
      setBuildStatus("GitHub OAuth client id が未設定です。VITE_GITHUB_OAUTH_CLIENT_ID を設定するか token を入力してください");
      endBrowserFirmwareOperation("oauth");
      return;
    }

    const previousController = githubDeviceFlowAbortRef.current;
    githubDeviceFlowAbortRef.current = null;
    previousController?.abort();
    setBrowserGithubUserCode("");
    setBrowserGithubVerificationUri("");
    const abortController = new AbortController();
    githubDeviceFlowAbortRef.current = abortController;

    try {
      const device = await requestGitHubDeviceCode({
        clientId,
        scope: "repo",
      });
      if (githubDeviceFlowAbortRef.current !== abortController) {
        return;
      }
      const verificationUri = device.verificationUriComplete ?? device.verificationUri;
      setBrowserGithubUserCode(device.userCode);
      setBrowserGithubVerificationUri(verificationUri);
      window.open(verificationUri, "_blank", "noopener,noreferrer");
      setBuildStatus(`GitHub の device 認証で ${device.userCode} を入力してください。開かない場合は画面上のリンクから認証を開けます`);
      const token = await pollGitHubDeviceToken({
        clientId,
        deviceCode: device.deviceCode,
        expiresIn: device.expiresIn,
        interval: device.interval,
        signal: abortController.signal,
      });
      if (githubDeviceFlowAbortRef.current !== abortController) {
        return;
      }
      if (!hasGitHubOAuthScope(token.scope, "repo")) {
        throw new Error("GitHub OAuth token に repo scope がありません。repository の読み書きと Actions 実行を許可して接続し直してください");
      }
      setBrowserGithubToken(token.accessToken);
      setBrowserGithubUserCode("");
      setBrowserGithubVerificationUri("");
      setBuildStatus(`GitHub 接続が完了しました: ${token.scope || "scope 未確認"}`);
    } catch (error) {
      if (githubDeviceFlowAbortRef.current !== abortController) {
        return;
      }
      if (abortController.signal.aborted) {
        setBuildStatus("GitHub 接続をキャンセルしました");
      } else {
        setBrowserGithubUserCode("");
        setBrowserGithubVerificationUri("");
        setBuildStatus(`GitHub 接続失敗: ${formatError(error)}`);
      }
    } finally {
      if (githubDeviceFlowAbortRef.current === abortController) {
        githubDeviceFlowAbortRef.current = null;
      }
      endBrowserFirmwareOperation("oauth");
    }
  }

  function cancelBrowserGithubConnection() {
    githubDeviceFlowAbortRef.current?.abort();
    githubDeviceFlowAbortRef.current = null;
    endBrowserFirmwareOperation("oauth");
    setBrowserGithubUserCode("");
    setBrowserGithubVerificationUri("");
  }

  function clearBrowserGithubToken() {
    githubDeviceFlowAbortRef.current?.abort();
    githubDeviceFlowAbortRef.current = null;
    setBrowserGithubToken("");
    setBrowserGithubUserCode("");
    setBrowserGithubVerificationUri("");
    setBuildStatus("GitHub token をメモリから消去しました");
  }

  async function loadBrowserFirmwareProject() {
    const ref = requireBrowserFirmwareRef();
    if (!ref) return;
    if (keymapDiff.length > 0) {
      setBuildStatus("現在の firmware 編集を上書きしないため GitHub 読み込みを止めました。Commit & Build するか、編集をリセットしてから読み込んでください");
      return;
    }
    if (!beginBrowserFirmwareOperation("load")) return;

    try {
      setBuildStatus(`GitHub から ${formatGitHubRepositoryRef(ref)} / ${browserFirmwareBranchRef} を読み込み中`);
      const snapshot = await readGitHubFirmwareProjectSnapshot(ref, browserFirmwareBranchRef, {
        token: browserGithubToken,
      });
      const project = snapshot.files;
      setProjectRoot(formatGitHubRepositoryRef(ref));
      setProjectDirHandle(null);
      setFiles(project);
      setSavedKeymap(project.keymap);
      setSavedLeftOverlay(project.leftOverlay);
      setSavedRightOverlay(project.rightOverlay);
      setFixtureError("");
      setBrowserFirmwareFilesLoadedFromGitHub(true);
      setBrowserFirmwareCommitSha(null);
      setBrowserFirmwareCommitUrl("");
      setBrowserFirmwareLoadedHeadSha(snapshot.headSha);
      setBrowserFirmwareRunId(null);
      setBrowserFirmwareRunUrl("");
      setBrowserFirmwareBuildStatus("idle");
      setBrowserFirmwareArtifacts(null);
      setBrowserFirmwareArtifactSource(null);
      setFirmwareFlashError("");
      clearBrowserFirmwareResetDone();
      setBrowserFirmwareLeftFlashed(false);
      setBrowserFirmwareRightFlashed(false);
      setBuildStatus(`GitHub から firmware files を読み込みました: ${formatGitHubRepositoryRef(ref)}`);
    } catch (error) {
      setBuildStatus(`GitHub firmware 読み込み失敗: ${formatError(error)}`);
    } finally {
      endBrowserFirmwareOperation("load");
    }
  }

  async function commitAndDispatchBrowserFirmwareBuild() {
    const ref = requireBrowserFirmwareRef();
    if (!ref || !files) return;
    if (!browserFirmwareReadiness.canCommit) {
      setBuildStatus(browserFirmwareReadiness.blockers[0] ?? "Commit 前の条件が揃っていません");
      return;
    }

    if (!browserFirmwareLoadedHeadSha) {
      setBuildStatus("GitHub から読み込み直してから commit してください");
      return;
    }
    if (!beginBrowserFirmwareOperation("commit-build")) return;

    let commit: Awaited<ReturnType<typeof commitGitHubFirmwareFiles>>;
    try {
      setBuildStatus("GitHub に commit を作成しています");
      commit = await commitGitHubFirmwareFiles({
        ref,
        branch: browserFirmwareBranchRef,
        expectedHeadSha: browserFirmwareLoadedHeadSha,
        files,
        options: { token: browserGithubToken },
      });
      setBrowserFirmwareCommitSha(commit.commitSha);
      setBrowserFirmwareCommitUrl(commit.htmlUrl);
      setBrowserFirmwareLoadedHeadSha(commit.commitSha);
      setBrowserFirmwareRunId(null);
      setBrowserFirmwareRunUrl("");
      setBrowserFirmwareBuildStatus("queued");
      setBrowserFirmwareArtifacts(null);
      setBrowserFirmwareArtifactSource(null);
      setFirmwareFlashError("");
      clearBrowserFirmwareResetDone();
      setBrowserFirmwareLeftFlashed(false);
      setBrowserFirmwareRightFlashed(false);
      setSavedKeymap(files.keymap);
      setSavedLeftOverlay(files.leftOverlay);
      setSavedRightOverlay(files.rightOverlay);
    } catch (error) {
      setBrowserFirmwareBuildStatus("failure");
      setBuildStatus(`GitHub commit 失敗: ${formatError(error)}`);
      endBrowserFirmwareOperation("commit-build");
      return;
    }

    try {
      await dispatchBrowserFirmwareBuildForCommit(ref, commit.commitSha);
      setBuildStatus(`commit と build 起動が完了しました: ${commit.commitSha.slice(0, 7)}`);
    } catch (error) {
      setBrowserFirmwareBuildStatus("failure");
      setBuildStatus(
        `commit は完了しましたが build 起動に失敗しました: ${formatError(error)}。Build 起動で再試行できます`,
      );
    } finally {
      endBrowserFirmwareOperation("commit-build");
    }
  }

  async function triggerBrowserFirmwareBuild() {
    const ref = requireBrowserFirmwareRef();
    if (!ref || !browserFirmwareCommitSha) {
      setBuildStatus("commit 作成後に build を起動できます");
      return;
    }
    if (!browserFirmwareReadiness.canBuild) {
      setBuildStatus(browserFirmwareReadiness.blockers[0] ?? "Build 起動条件が揃っていません");
      return;
    }
    if (!beginBrowserFirmwareOperation("build")) return;

    try {
      await dispatchBrowserFirmwareBuildForCommit(ref, browserFirmwareCommitSha);
    } catch (error) {
      setBrowserFirmwareBuildStatus("failure");
      setBuildStatus(`GitHub build 起動失敗: ${formatError(error)}`);
    } finally {
      endBrowserFirmwareOperation("build");
    }
  }

  async function dispatchBrowserFirmwareBuildForCommit(ref: GitHubRepositoryRef, commitSha: string) {
    setBuildStatus("GitHub Actions build を起動しています");
    setBrowserFirmwareRunId(null);
    setBrowserFirmwareRunUrl("");
    setBrowserFirmwareBuildStatus("queued");
    setBrowserFirmwareArtifacts(null);
    setBrowserFirmwareArtifactSource(null);
    setFirmwareFlashError("");
    clearBrowserFirmwareResetDone();
    setBrowserFirmwareLeftFlashed(false);
    setBrowserFirmwareRightFlashed(false);
    await dispatchGitHubFirmwareBuild(ref, browserFirmwareBranchRef, { token: browserGithubToken });
    setBuildStatus(`build workflow を起動しました: ${commitSha.slice(0, 7)}`);
  }

  async function refreshBrowserFirmwareBuildRun() {
    const ref = requireBrowserFirmwareRef();
    if (!ref || !browserFirmwareCommitSha) {
      setBuildStatus("commit 作成後に build run を確認できます");
      return;
    }
    if (!beginBrowserFirmwareOperation("refresh-run")) return;

    try {
      const run = await findGitHubFirmwareBuildRun(ref, browserFirmwareBranchRef, browserFirmwareCommitSha, {
        token: browserGithubToken,
      });
      if (!run) {
        setBuildStatus("対象 commit の GitHub Actions run はまだ見つかりません");
        return;
      }
      setBrowserFirmwareRunId(run.id);
      setBrowserFirmwareRunUrl(run.htmlUrl);
      setBrowserFirmwareBuildStatus(mapGitHubRunStatus(run.status, run.conclusion));
      setBuildStatus(`GitHub Actions: ${run.status} / ${run.conclusion ?? "pending"} / run ${run.id}`);
    } catch (error) {
      setBuildStatus(`GitHub Actions 確認失敗: ${formatError(error)}`);
    } finally {
      endBrowserFirmwareOperation("refresh-run");
    }
  }

  async function downloadBrowserFirmwareArtifacts() {
    const ref = requireBrowserFirmwareRef();
    if (!ref || browserFirmwareRunId === null || !browserFirmwareCommitSha) {
      setBuildStatus("成功した build run を確認してから artifact を取得してください");
      return;
    }
    if (!canAttemptBrowserFirmwareArtifactDownload) {
      setBuildStatus("GitHub token / repository / branch / run を確認してから artifact を取得してください");
      return;
    }
    if (!beginBrowserFirmwareOperation("download-artifact")) return;
    // Drop previously verified UF2 bytes before revalidating the run/artifact.
    setBrowserFirmwareArtifacts(null);
    setBrowserFirmwareArtifactSource(null);
    clearBrowserFirmwareResetDone();
    setBrowserFirmwareLeftFlashed(false);
    setBrowserFirmwareRightFlashed(false);

    try {
      const artifacts = await downloadGitHubFirmwareArtifacts(
        ref,
        browserFirmwareRunId,
        { token: browserGithubToken },
        {
          expectedHeadSha: browserFirmwareCommitSha,
          expectedHeadBranch: browserFirmwareBranchRef,
          requireSuccess: true,
        },
      );
      setBrowserFirmwareArtifacts(artifacts);
      setBrowserFirmwareArtifactSource("github");
      setBrowserFirmwareBuildStatus("success");
      setFirmwareFlashError("");
      setBuildStatus(
        `artifact を取得しました: left ${artifacts.targets.left ? "OK" : "未検出"} / reset ${
          artifacts.targets.reset ? "OK" : "未検出"
        } / right ${
          artifacts.targets.right ? "OK" : "未検出"
        }${artifacts.manifestPath ? " / manifest OK" : ""}`,
      );
    } catch (error) {
      setBuildStatus(`GitHub artifact 取得失敗: ${formatError(error)}`);
    } finally {
      endBrowserFirmwareOperation("download-artifact");
    }
  }

  async function importBrowserFirmwareArtifactFolder() {
    if (typeof window.showDirectoryPicker !== "function") {
      setBuildStatus("Artifact フォルダ選択は Chrome / Edge の File System Access API が必要です");
      return;
    }
    if (!beginBrowserFirmwareOperation("import-artifact")) return;

    try {
      const handle = await window.showDirectoryPicker({
        mode: "read",
        startIn: browserFirmwareArtifactFolderHandleRef.current ?? "downloads",
      });
      browserFirmwareArtifactFolderHandleRef.current = handle;
      const artifacts = await readLocalFirmwareArtifactsFromDirectoryHandle(handle);
      setBrowserFirmwareArtifacts(artifacts);
      setBrowserFirmwareArtifactSource("folder");
      setFirmwareFlashError("");
      clearBrowserFirmwareResetDone();
      setBrowserFirmwareLeftFlashed(false);
      setBrowserFirmwareRightFlashed(false);
      setFlashSide("left");
      setBuildStatus(
        `artifact フォルダから UF2 を読み込みました: left ${artifacts.targets.left ? "OK" : "未検出"} / reset ${
          artifacts.targets.reset ? "OK" : "未検出"
        } / right ${
          artifacts.targets.right ? "OK" : "未検出"
        }`,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setBuildStatus("artifact フォルダ選択をキャンセルしました");
        return;
      }
      setBuildStatus(`artifact フォルダ読み込み失敗: ${formatError(error)}`);
    } finally {
      endBrowserFirmwareOperation("import-artifact");
    }
  }

  async function copyBrowserFirmwareUf2(side: FlashSide) {
    setFirmwareFlashError("");
    if (!canFlashFirmwareSide(browserFirmwareReadiness, side)) {
      const message = browserFirmwareReadiness.blockers[0] ?? `${sideLabel(side)} 側を書き込む条件が揃っていません`;
      setFirmwareFlashError(message);
      setBuildStatus(message);
      return;
    }
    if (typeof window.showDirectoryPicker !== "function") {
      const message = "このブラウザではフォルダ選択による直接コピーが使えません。デスクトップ版を使ってください";
      setFirmwareFlashError(message);
      setBuildStatus(message);
      return;
    }
    if (!beginBrowserFirmwareOperation("flash")) return;

    try {
      const isFirmwarePhase = browserFirmwareResetDoneRef.current[side];
      const target = isFirmwarePhase ? browserFirmwareUf2Target(side) : browserFirmwareUf2Target("reset");
      if (!target) {
        const message = isFirmwarePhase ? `${sideLabel(side)} UF2 が見つかりません` : "reset UF2 が artifact に見つかりません";
        setFirmwareFlashError(message);
        setBuildStatus(message);
        return;
      }

      const phaseLabel = isFirmwarePhase ? `${sideLabel(side)} firmware` : "reset";
      setBuildStatus(`${sideLabel(side)} 側の bootloader ドライブを選択してください: ${phaseLabel} UF2`);
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      await assertUf2BootloaderDirectory(handle);
      if (!(await requestFlashConfirmation({ kind: "write", side, uf2Name: target.name, volumeName: handle.name }))) {
        setBuildStatus(`${phaseLabel} UF2 の直接コピーをキャンセルしました`);
        return;
      }

      setBuildStatus(`${phaseLabel} UF2 を ${handle.name} にコピーしています`);
      const writeResult = await writeBrowserUf2ToDirectoryHandle(handle, target);
      const retrySuffix = writeResult.attempts > 1 ? `（${writeResult.attempts} 回目で成功）` : "";
      const writeSuffix = `${retrySuffix}${writeResult.ambiguousEject ? "。bootloader が再起動してドライブが消えた可能性があります" : ""}`;
      setFirmwareFlashError("");
      if (!isFirmwarePhase) {
        setBrowserFirmwareSideResetDone(side, true);
        setBuildStatus(
          `reset UF2 を ${handle.name} に直接コピーしました${writeSuffix}。もう一度 ${sideLabel(side)} 側を bootloader に入れて、同じボタンで firmware UF2 をコピーしてください`,
        );
        return;
      }

      markBrowserFirmwareSideFlashed(side);
      setBrowserFirmwareSideResetDone(side, false);
      setBuildStatus(browserFirmwareFlashCompleteMessage(side, `${handle.name} に直接コピーしました${writeSuffix}`));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setBuildStatus(`${sideLabel(side)} UF2 の直接コピーをキャンセルしました`);
        return;
      }
      const message = `${sideLabel(side)} UF2 の直接コピー失敗: ${formatError(error)}`;
      setFirmwareFlashError(message);
      setBuildStatus(message);
    } finally {
      endBrowserFirmwareOperation("flash");
    }
  }

  function browserFirmwareUf2Target(side: FlashSide | "reset") {
    const targetName = browserFirmwareArtifacts?.targets[side];
    return targetName ? browserFirmwareArtifacts?.files.find((file) => file.name === targetName) ?? null : null;
  }

  function markBrowserFirmwareSideFlashed(side: FlashSide) {
    if (side === "left") {
      setBrowserFirmwareLeftFlashed(true);
      if (!browserFirmwareRightFlashed) {
        setFlashSide("right");
      }
    } else {
      setBrowserFirmwareRightFlashed(true);
      if (!browserFirmwareLeftFlashed) {
        setFlashSide("left");
      }
    }
  }

  function browserFirmwareFlashCompleteMessage(side: FlashSide, result: string) {
    return side === "left"
      ? `Left UF2: ${result}。次は USB を右側へ差し替え、右側を bootloader にして reset UF2 から直接コピーします。`
      : `Right UF2: ${result}。左右の書き込みが完了しました。`;
  }

  function requestFlashConfirmation(request: Omit<FlashConfirmationRequest, "id">): Promise<boolean> {
    flashConfirmationResolverRef.current?.(false);
    return new Promise((resolve) => {
      flashConfirmationResolverRef.current = resolve;
      setFlashConfirmation({
        ...request,
        id: Date.now(),
        uf2Name: request.uf2Name.split("/").pop() ?? request.uf2Name,
        volumeName: request.volumeName ? request.volumeName.split("/").pop() ?? request.volumeName : undefined,
      });
    });
  }

  function resolveFlashConfirmation(confirmed: boolean) {
    flashConfirmationResolverRef.current?.(confirmed);
    flashConfirmationResolverRef.current = null;
    setFlashConfirmation(null);
  }

  async function readFlashTargets() {
    const targets = await invoke<FirmwareFlashTargets>("resolve_firmware_flash_targets", { root: projectRoot });
    const nextFirmwareTargets = firmwareTargetsFromResolved(targets);
    setUf2Files(targets.uf2Files);
    setBootloaderVolumes(targets.bootloaderVolumes);
    setFirmwareUf2Targets(nextFirmwareTargets);
    setSelectedUf2((current) =>
      current && targets.uf2Files.includes(current)
        ? current
        : targets.leftUf2 ?? targets.rightUf2 ?? targets.uf2Files[0] ?? "",
    );
    setSelectedVolume((current) =>
      current && targets.bootloaderVolumes.includes(current)
        ? current
        : targets.bootloaderVolumes.length === 1
          ? targets.bootloaderVolumes[0]
          : "",
    );
    return {
      uf2Files: targets.uf2Files,
      bootloaderVolumes: targets.bootloaderVolumes,
      firmwareUf2Targets: nextFirmwareTargets,
    };
  }

  async function refreshFlashTargets() {
    try {
      const { uf2Files: nextUf2Files, bootloaderVolumes: nextVolumes } = await readFlashTargets();
      setFirmwareFlashError("");
      setBuildStatus(`UF2 ${nextUf2Files.length} 件 / bootloader ${nextVolumes.length} 件`);
    } catch (error) {
      const message = `UF2/volume 確認失敗: ${String(error)}`;
      setFirmwareFlashError(message);
      setBuildStatus(message);
    }
  }

  async function copySelectedUf2() {
    setFirmwareFlashError("");
    if (!selectedUf2 || !selectedVolume) {
      const message = "UF2 と bootloader volume を選択してください";
      setFirmwareFlashError(message);
      setBuildStatus(message);
      return;
    }

    const volumeName = selectedVolume.split("/").pop() ?? selectedVolume;
    const confirmed = await requestFlashConfirmation({
      kind: "write",
      side: flashSide,
      uf2Name: selectedUf2,
      volumeName,
    });
    if (!confirmed) {
      return;
    }

    try {
      const destination = await invoke<string>("copy_uf2_to_volume", {
        uf2Path: selectedUf2,
        volumePath: selectedVolume,
      });
      setFirmwareFlashError("");
      setBuildStatus(`書き込みコピー完了: ${destination}`);
    } catch (error) {
      const message = `UF2 コピー失敗: ${String(error)}`;
      setFirmwareFlashError(message);
      setBuildStatus(message);
    }
  }

  async function copyWizardUf2(side: FlashSide) {
    setFirmwareFlashError("");
    const uf2Path = firmwareUf2Targets[side];
    if (!uf2Path) {
      const message = `${sideLabel(side)} 用 UF2 が見つかりません。Artifact 取得を実行してください`;
      setFirmwareFlashError(message);
      setBuildStatus(message);
      return;
    }

    const volumePath = bootloaderVolumes.length === 1 ? bootloaderVolumes[0] : selectedVolume;
    if (!volumePath) {
      const message =
        bootloaderVolumes.length > 1
          ? `複数の bootloader volume が見つかりました。${sideLabel(side)} 側の Bootloader を選択してください`
          : `${sideLabel(side)} 側を bootloader に入れてから UF2 / Volume を更新してください`;
      setFirmwareFlashError(message);
      setBuildStatus(message);
      return;
    }

    const volumeName = volumePath.split("/").pop() ?? volumePath;
    const confirmed = await requestFlashConfirmation({ kind: "write", side, uf2Name: uf2Path, volumeName });
    if (!confirmed) {
      return;
    }

    try {
      const destination = await invoke<string>("copy_uf2_to_volume", { uf2Path, volumePath });
      const nextSide = side === "left" ? "right" : "left";
      setFlashSide(nextSide);
      setFirmwareFlashError("");
      setBuildStatus(`${sideLabel(side)} 側を書き込みました: ${destination}`);
    } catch (error) {
      const message = `${sideLabel(side)} 側の UF2 コピー失敗: ${formatError(error)}`;
      setFirmwareFlashError(message);
      setBuildStatus(message);
    }
  }

  if (isMobileUnsupported && !isDesktopRuntime) {
    return <MobileUnsupportedScreen />;
  }

  return (
    <main className="app-shell">
      <header className={`topbar ${isDirectMode ? "direct-active" : ""}`}>
        <div>
          <p className="eyebrow">KobitoKey Studio</p>
          <h1>KobitoKey 設定エディタ</h1>
        </div>
        <div className="topbar-tools">
          <div className="mode-toggle" aria-label="Editor mode">
		            <button
		              type="button"
		              className={editorMode === "firmware" ? "active" : ""}
		              onPointerDown={() => setEditorMode("firmware")}
		              onClick={() => setEditorMode("firmware")}
		            >
	              Firmware
	              {!isDesktopRuntime ? <em className="mode-toggle-badge">GitHub連携</em> : null}
	            </button>
	            <button
	              type="button"
	              className={editorMode === "direct" ? "active" : ""}
	              onPointerDown={() => setEditorMode("direct")}
	              onClick={() => setEditorMode("direct")}
	            >
              Direct
            </button>
          </div>
          <nav className="topbar-links" aria-label="関連リンク">
            <a href={firmwareRepoHref} target="_blank" rel="noreferrer" title="Firmware repository を GitHub で開く">
              <Github size={15} />
              <span>GitHub</span>
            </a>
            <a href={USER_GUIDE_URL} target="_blank" rel="noreferrer" title="ユーザガイドを開く">
              <BookOpen size={15} />
              <span>ユーザガイド</span>
            </a>
          </nav>
	          {editorMode === "firmware" && isDesktopRuntime ? (
	            <div className="project-loader" role="group" aria-label="プロジェクトフォルダ">
              <label className="project-loader-field">
                <span className="project-loader-label">
                  プロジェクトフォルダ
                  {projectDirHandle ? (
                    <em className="project-loader-write-chip" title="このフォルダに直接保存されます">直接保存</em>
                  ) : null}
                </span>
                <input
                  id="firmware-project-root"
                  name="firmwareProjectRoot"
                  aria-label="KobitoKey_QWERTY フォルダのパス"
                  placeholder="例: ~/dev/KobitoKey_QWERTY"
                  title="keymap と overlay を読み書きするローカルフォルダ"
                  value={projectRoot}
                  onChange={(event) => {
                    setProjectRoot(event.target.value);
                    // Typed paths cannot map back to an FS handle, so the
                    // user has implicitly opted out of direct writes.
                    setProjectDirHandle(null);
                  }}
                />
              </label>
              <button
                type="button"
                className="project-loader-browse"
                onClick={chooseProjectFolder}
                title={isDesktopRuntime ? "ローカルフォルダを選ぶ" : "ブラウザでフォルダを選ぶ"}
              >
                <FolderOpen size={17} />
                参照…
              </button>
              <button
                type="button"
                className="primary project-loader-load"
                onClick={loadProject}
                title="このフォルダから keymap / overlay を読み込む"
              >
                <Download size={17} />
                読み込み
              </button>
              <input
                ref={folderInputRef}
                type="file"
                name="firmwareProjectFolder"
                /* eslint-disable @typescript-eslint/ban-ts-comment */
                /* @ts-ignore — non-standard but widely supported attribute */
                webkitdirectory=""
                directory=""
                multiple
                style={{ display: "none" }}
                onChange={(event) => {
                  const list = event.currentTarget.files;
                  if (list && list.length > 0) {
                    void loadProjectFromFileList(list);
                  }
                  event.currentTarget.value = "";
                }}
              />
            </div>
	          ) : editorMode === "firmware" ? (
	            <div className="topbar-hint">
	              <UploadCloud size={17} />
	              <span>Build & Flash ボタンから GitHub repository を読み込みます</span>
	            </div>
	          ) : directKeymap ? (
            <div className="studio-loader connected-loader" role="group" aria-label="接続状態">
              <span className="connected-chip">
                {studioConnectionKind === "bluetooth" ? <Bluetooth size={14} /> : <Usb size={14} />}
                <strong>
                  {directKeymap.deviceName || (studioConnectionKind === "bluetooth" ? "Bluetooth device" : "USB device")}
                </strong>
                <em>{studioConnectionKind.toUpperCase()} 接続中</em>
              </span>
              <button type="button" onClick={() => readStudioDevice()} disabled={studioConnectionState === "connecting"}>
                <RefreshCw size={17} />
                再読み込み
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => void disconnectStudioDevice()}
                disabled={studioConnectionState === "connecting"}
              >
                切断
              </button>
            </div>
          ) : (
            <div className="topbar-hint">
              {canUseWebBluetooth ? <Bluetooth size={17} /> : <Usb size={17} />}
              <span>
                {canUseWebUsb || canUseWebBluetooth
                  ? "接続パネルから USB または Bluetooth で KobitoKey に接続します"
                  : "Web Serial / Web Bluetooth がこのページから見えていません。Chrome/Edge と localhost/HTTPS を確認してください"}
              </span>
            </div>
          )}
        </div>
      </header>

      <ToastViewport toast={toast} onDismiss={() => setToast(null)} />

      {showDirectEmptyState ? (
        <DirectWelcome
          canUseWebBluetooth={canUseWebBluetooth}
          canUseWebUsb={canUseWebUsb}
          connectionError={studioConnectionError}
          connectionKind={studioConnectionKind}
          connectionState={studioConnectionState}
          isDesktopRuntime={isDesktopRuntime}
          ports={studioPorts}
          bluetoothDevices={studioBluetoothDevices}
          selectedBluetoothDevice={selectedBluetoothDevice}
          selectedPort={selectedStudioPort}
          onBluetoothDeviceChange={setSelectedBluetoothDevice}
          onConnect={connectStudioDevice}
          onPortChange={setSelectedStudioPort}
          onRefresh={refreshStudioPorts}
          onTransportChange={setStudioConnectionKind}
        />
      ) : showFirmwareLoadingState ? (
        <FirmwareProjectLoadingState status={status} />
      ) : showFirmwareEmptyState ? (
        <FirmwareProjectEmptyState status={status} onBuildFlash={openFirmwareBuildFlash} />
      ) : (
      <section
        className={`workspace ${isDirectMode ? "direct-workspace" : ""} ${
          !isDirectMode && workbenchTab === "build" ? "firmware-build-workspace" : ""
        }`}
      >
        <nav className="sidebar" aria-label="Layers">
          {ENABLE_LAYER_STRUCTURE_EDITING ? (
            <div className="layer-toolbar" role="group" aria-label="Layer controls">
              <button
                type="button"
                onClick={createLayer}
                disabled={!canEditLayerStructure}
                title={isDirectMode ? "Direct Mode では layer 構造を変更できません" : "末尾に空の layer を追加"}
                aria-label="Layer を追加"
              >
                <Plus size={15} />
              </button>
              <button
                type="button"
                onClick={duplicateLayer}
                disabled={!canEditLayerStructure || !activeLayer}
                title={isDirectMode ? "Direct Mode では layer 構造を変更できません" : "選択中の layer を複製"}
                aria-label="選択中の layer を複製"
              >
                <Copy size={15} />
              </button>
              <button
                type="button"
                className="danger"
                onClick={removeActiveLayer}
                disabled={!canDeleteActiveLayer}
                title={
                  isDirectMode
                    ? "Direct Mode では layer 構造を変更できません"
                    : activeLayerDeletionBlockReason ||
                      "番号参照のずれを避けるため、最後の layer だけ削除できます"
                }
                aria-label="選択中の layer を削除"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ) : null}
          <div className="layer-list">
            {layers.map((layer, index) => (
              <button
                type="button"
                key={layer.id}
                className={index === activeLayerIndex ? "active" : ""}
                onClick={() => {
                  setActiveLayerIndex(index);
                  setSelectedKeyIndex(0);
                }}
              >
                <span>{index}</span>
                {layer.label}
              </button>
            ))}
          </div>
        </nav>

        <section className={`keyboard-panel ${!isDirectMode && workbenchTab === "build" ? "firmware-build-mode" : ""}`}>
          {isDirectMode ? (
            <DirectConnectionBar
              comboSource={directComboSource}
              connectionKind={studioConnectionKind}
              connectionState={studioConnectionState}
              isDesktopRuntime={isDesktopRuntime}
              keymap={directKeymap}
              portPath={selectedStudioPort}
            />
          ) : null}
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Layer {activeLayerIndex}</p>
              <h2>{activeLayer?.label ?? "No layer"}</h2>
            </div>
            {isDirectMode ? (
              <button type="button" className="primary" onClick={() => readStudioDevice()}>
                <RefreshCw size={17} />
                再読み込み
              </button>
            ) : null}
          </div>

          <KeyboardGrid
            combos={activeCombos}
            draftKeyIndexes={isDirectMode ? activeLayerDraftKeyIndexes : undefined}
            layer={activeLayer}
            selectedComboId={selectedComboId}
            selectedKeyIndex={selectedKeyIndex}
            onComboSelect={setSelectedComboId}
            onSelect={setSelectedKeyIndex}
          />

          {!isDirectMode && keymapParseWarnings.length > 0 ? (
            <KeymapParseWarningPanel warnings={keymapParseWarnings} />
          ) : null}

          {isDirectMode ? (
            <DirectPendingChangesBar
              canWrite={studioConnectionState === "connected"}
              changes={directKeyDraftList}
              isWriting={directKeyWriteFeedback.kind === "writing"}
              onDiscardAll={() => discardDirectKeyDrafts()}
              onDiscardSelected={() => selectedDirectKeyDraft && discardDirectKeyDrafts([selectedDirectKeyDraft])}
              onWriteAll={() => writeDirectKeyDrafts()}
              onWriteSelected={() => selectedDirectKeyDraft && writeDirectKeyDrafts([selectedDirectKeyDraft])}
              selectedDraft={selectedDirectKeyDraft}
            />
          ) : null}

          {isDirectMode ? (
            <DirectSummaryPanel
              connectionKind={studioConnectionKind}
              firmwareComboDiffs={directFirmwareComboDiffs}
              firmwareDiffs={directFirmwareDiffs}
              keymap={directKeymap}
              onApplyFirmwareComboDiffs={applyDirectFirmwareComboDiffs}
              onApplyFirmwareDiffs={applyDirectFirmwareDiffs}
              portPath={selectedStudioPort}
            />
          ) : (
            <>
              <FirmwareWorkbenchActions
                activeTab={workbenchTab}
                canReset={keymapDiff.length > 0}
                canSaveProject={Boolean(files)}
                diffCount={keymapDiff.length}
                onBuildFlash={toggleFirmwareBuildFlash}
                onReset={resetFirmwareEdits}
                onSaveProject={saveProjectFiles}
                projectSaveMode={files?.keymapPath || projectDirHandle ? "save" : "export"}
              />
              {workbenchTab === "build" && !isDesktopRuntime ? (
                <BrowserFirmwareReleaseWorkbench
                  artifacts={browserFirmwareArtifacts}
                  branch={browserFirmwareBranch}
                  buildStatus={buildStatus}
                  busyOperation={browserFirmwareOperation}
                  canDownloadArtifacts={canAttemptBrowserFirmwareArtifactDownload}
                  commitSha={browserFirmwareCommitSha}
                  commitUrl={browserFirmwareCommitUrl}
                  flashError={firmwareFlashError}
                  flashSide={flashSide}
                  githubOAuthAvailable={Boolean(githubOAuthClientId())}
                  onBack={closeFirmwareBuildFlash}
                  resetDone={browserFirmwareResetDone}
                  readiness={browserFirmwareReadiness}
                  repoRef={browserFirmwareRepoRef}
                  repoUrl={firmwareRepoUrl}
                  runId={browserFirmwareRunId}
                  runUrl={browserFirmwareRunUrl}
                  token={browserGithubToken}
                  onBranchChange={setBrowserFirmwareBranch}
                  onCancelGithubConnection={cancelBrowserGithubConnection}
                  onClearToken={clearBrowserGithubToken}
                  onCommitBuild={commitAndDispatchBrowserFirmwareBuild}
                  onConnectGithub={connectBrowserGithub}
                  onCopyUf2={copyBrowserFirmwareUf2}
                  onDiffReviewed={() => setBrowserFirmwareDiffReviewed(true)}
                  onDownloadArtifacts={downloadBrowserFirmwareArtifacts}
                  onImportArtifactFolder={importBrowserFirmwareArtifactFolder}
                  onLoadProject={loadBrowserFirmwareProject}
                  onRefreshRun={refreshBrowserFirmwareBuildRun}
                  onRepoUrlChange={setFirmwareRepoUrl}
                  onTokenChange={setBrowserGithubToken}
                  onTriggerBuild={triggerBrowserFirmwareBuild}
                  userCode={browserGithubUserCode}
                  verificationUri={browserGithubVerificationUri}
                />
              ) : null}
              {workbenchTab === "build" && isDesktopRuntime ? (
                <BuildWorkbench
                  buildCheck={firmwareBuildCheck}
                  buildStatus={buildStatus}
                  flashSide={flashSide}
                  flashError={firmwareFlashError}
                  firmwareUf2Targets={firmwareUf2Targets}
                  firmwareRepoLabel={firmwareRepoLabel}
                  firmwareRepoUrl={firmwareRepoUrl}
                  uf2Files={uf2Files}
                  bootloaderVolumes={bootloaderVolumes}
                  selectedUf2={selectedUf2}
                  selectedVolume={selectedVolume}
                  onBack={closeFirmwareBuildFlash}
                  onSelectUf2={setSelectedUf2}
                  onSelectVolume={setSelectedVolume}
                  onCheckBuildReady={checkFirmwareBuildReady}
                  onFirmwareRepoUrlChange={setFirmwareRepoUrl}
                  onTriggerBuild={triggerBuild}
                  onSavePushBuild={savePushAndTriggerBuild}
                  onRefreshBuildStatus={refreshBuildStatus}
                  onDownloadArtifacts={downloadArtifacts}
                  onRefreshFlashTargets={refreshFlashTargets}
                  onFlashSideChange={setFlashSide}
                  onFlashWizardCopy={copyWizardUf2}
                  onCopySelectedUf2={copySelectedUf2}
                />
              ) : null}
              {workbenchTab !== "build" ? (
                <WorkbenchTabs
                  activeTab={workbenchTab}
                  onTabChange={selectFirmwareWorkbenchTab}
                  comboCount={combos.length}
                  diffCount={keymapDiff.length}
                >
                  {workbenchTab === "combos" ? (
                    <ComboWorkbench
                      combos={combos}
                      selectedCombos={selectedCombos}
                      selectedCombo={selectedCombo}
                      onSelect={setSelectedComboId}
                      onCreate={createCombo}
                      onDelete={removeCombo}
                      onSave={saveCombo}
                    />
                  ) : null}
                  {workbenchTab === "trackball" ? (
                    <TrackballWorkbench settings={trackball} onApply={applyTrackballSettings} />
                  ) : null}
                  {workbenchTab === "diff" ? <DiffWorkbench diffs={keymapDiff} /> : null}
                </WorkbenchTabs>
              ) : null}
            </>
          )}
        </section>

        {!isDirectMode && workbenchTab === "build" ? null : (
        <aside className="inspector">
          {isDirectMode ? (
            <DirectInspectorTabs
              binding={bindingDraft}
              combos={activeCombos}
              comboSource={displayedDirectComboSource}
              comboError={directComboError}
              connectionState={studioConnectionState}
              maxCombos={displayedDirectMaxCombos}
	              canOpenFirmwareMode={true}
              keyIndex={selectedKeyIndex}
              onApply={applyBinding}
              onCreateCombo={createDirectCombo}
              onDeleteCombo={removeDirectCombo}
              onFirmwareMode={() => setEditorMode("firmware")}
              onPreviewCombo={stageDirectCombo}
              onRefreshCombos={() => refreshDirectCombos()}
              onSaveCombo={saveDirectCombo}
              onSelectCombo={setSelectedComboId}
              selectedCombo={selectedCombo}
              selectedCombos={selectedCombos}
              selectedBinding={selectedDeviceBinding}
              firmwareTrackball={trackball}
              canWriteCombos={Boolean(directKeymap)}
              canEditKey={Boolean(directKeymap)}
              keyWriteFeedback={directKeyWriteFeedback}
            />
          ) : (
            <FirmwareKeyInspector
              binding={bindingDraft}
              canApplyBinding={hasPendingFirmwareKeyDraft}
              keyIndex={selectedKeyIndex}
              onDraftChange={(binding) => {
                pendingFirmwareBindingRef.current = binding;
                setBindingDraft(binding);
              }}
              onApplyBinding={applyBinding}
              selectedBinding={selectedBinding}
	            />
          )}
        </aside>
        )}
      </section>
      )}

      <FlashConfirmationDialog request={flashConfirmation} onResolve={resolveFlashConfirmation} />

      <footer className="statusbar">{status}</footer>
    </main>
  );
}

function FlashConfirmationDialog({
  request,
  onResolve,
}: {
  request: FlashConfirmationRequest | null;
  onResolve: (confirmed: boolean) => void;
}) {
  const dialogRef = React.useRef<HTMLDialogElement | null>(null);
  const [keyboardHalfChecked, setKeyboardHalfChecked] = React.useState(false);

  React.useEffect(() => {
    setKeyboardHalfChecked(false);
    const dialog = dialogRef.current;
    if (!request || !dialog) {
      return;
    }
    if (!dialog.open) {
      dialog.showModal();
    }
    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, [request]);

  if (!request) {
    return null;
  }

  const side = sideLabel(request.side);
  const titleId = `flash-confirm-title-${request.id}`;
  const descriptionId = `flash-confirm-description-${request.id}`;

  return (
    <dialog
      ref={dialogRef}
      className="flash-confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onResolve(false);
      }}
    >
      <div className="flash-confirm-icon" aria-hidden="true">
        <AlertTriangle size={20} />
      </div>
      <div className="flash-confirm-body">
        <p className="eyebrow">UF2 Flash Confirmation</p>
        <h2 id={titleId}>{side} 側の書き込み確認</h2>
        <p id={descriptionId}>
          {request.uf2Name} を {request.volumeName ?? `${side} 側の bootloader volume`} にコピーします。接続中の half とコピー先が正しいことを確認してください。
        </p>
        {request.volumeName ? (
          <dl className="flash-confirm-targets">
            <div>
              <dt>UF2</dt>
              <dd>{request.uf2Name}</dd>
            </div>
            <div>
              <dt>Volume</dt>
              <dd>{request.volumeName}</dd>
            </div>
          </dl>
        ) : null}
        <label className="flash-confirm-check">
          <input
            type="checkbox"
            checked={keyboardHalfChecked}
            onChange={(event) => setKeyboardHalfChecked(event.target.checked)}
            autoFocus
          />
          <span>接続中の keyboard half が {side} 側で、コピー先として正しいことを確認しました</span>
        </label>
        <div className="flash-confirm-actions">
          <button type="button" onClick={() => onResolve(false)}>
            キャンセル
          </button>
          <button type="button" className="primary" disabled={!keyboardHalfChecked} onClick={() => onResolve(true)}>
            コピーを開始
          </button>
        </div>
      </div>
    </dialog>
  );
}

type ComboFormValue = {
  binding: string;
  keyPositions: string;
  timeoutMs: number;
};

type TrackballSettingKey = keyof Pick<
  TrackballSettings,
  | "leftCpi"
  | "rightCpi"
  | "pointerMinFactor"
  | "pointerMaxFactor"
  | "pointerSpeedThreshold"
  | "pointerAccelerationExponent"
  | "rightPointerMinFactor"
  | "rightPointerMaxFactor"
  | "rightPointerSpeedThreshold"
  | "rightPointerAccelerationExponent"
  | "gestureThreshold"
  | "tabThreshold"
  | "desktopThreshold"
>;
type EditableTrackballSettings = Pick<TrackballSettings, TrackballSettingKey>;

function updateOptionalBlockNumberSetting(
  source: string,
  blockName: string,
  propertyName: string,
  value: number | undefined,
): string {
  return typeof value === "number" ? updateBlockNumberSetting(source, blockName, propertyName, value) : source;
}

function defaultDirectTrackballSettings(): DirectTrackballSettings {
  return {
    cpi: 800,
    cursorNumerator: 1,
    cursorDenominator: 1,
    scrollNumerator: 1,
    scrollDenominator: 1,
  };
}

function scaleToNumber(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 1;
}

function numberToScale(value: number): { numerator: number; denominator: number } {
  const denominator = 100;
  const numerator = Math.max(1, Math.round(value * denominator));
  const divisor = gcd(numerator, denominator);
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  };
}

function gcd(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right > 0) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left || 1;
}

function formatError(error: unknown): string {
  if (typeof error === "object" && error && "message" in error) {
    const message = String((error as { message: unknown }).message);
    if ("name" in error) {
      const name = String((error as { name: unknown }).name);
      return name && name !== "Error" ? `${name}: ${message}` : message;
    }
    return message;
  }
  return String(error);
}

function formatDirectConnectionIssue({
  error,
  kind,
  prefix,
  runtime,
}: {
  error: unknown;
  kind: StudioConnectionKind;
  prefix: string;
  runtime: "desktop" | "web";
}): DirectConnectionIssue {
  const errorMessage = formatError(error);
  const rawMessage = `${prefix}: ${errorMessage}`;
  const normalized = rawMessage.toLowerCase();

  if (kind === "usb" && isUsbPortOpenFailure(normalized)) {
    return {
      summary: "USB port を開けませんでした",
      detail: "別のタブ、Chrome の前回接続、または他のアプリが KobitoKey を使用中の可能性があります。",
      actions: [
        "他の KobitoKey Studio タブを閉じる",
        "接続済み画面があれば「切断」を押す",
        "USB を抜き差しする",
        "まだ失敗する場合は Chrome を完全終了して再起動する",
      ],
      rawMessage,
    };
  }

  if (kind === "usb" && isNoUsbDeviceFailure(normalized)) {
    return {
      summary: "USB device が見つかりません",
      detail: "KobitoKey が data 通信できる USB 接続として見えていません。",
      actions: [
        "USB data cable で接続しているか確認する",
        "KobitoKey に ZMK Studio 対応 firmware が入っているか確認する",
        runtime === "desktop" ? "device 検出を押して USB デバイス一覧を更新する" : "Chrome / Edge で localhost または HTTPS から開き直す",
      ],
      rawMessage,
    };
  }

  if (isStudioUnlockFailure(normalized)) {
    return {
      summary: "ZMK Studio がロックされています",
      detail: "USB 接続は開けていますが、キーボード側が Studio 設定の読み取りを許可していません。",
      actions: [
        "KobitoKey の Studio Unlock キーを押す",
        "Unlock 後にもう一度 USB で接続する",
        "Studio Unlock key がない firmware の場合は Firmware Mode で配置して build / flash する",
      ],
      rawMessage,
    };
  }

  if (kind === "usb" && normalized.includes("failed to read studio keymap")) {
    return {
      summary: "ZMK Studio keymap を読み込めません",
      detail: "USB 接続は開けていますが、キーボードから keymap を取得できませんでした。",
      actions: [
        "KobitoKey に ZMK Studio 対応 firmware が入っているか確認する",
        "Studio Unlock キーを押してから再接続する",
        "USB を抜き差ししてもう一度接続する",
      ],
      rawMessage,
    };
  }

  if (kind === "usb" && normalized.includes("web serial is not available")) {
    return {
      summary: "Web Serial が使えません",
      detail: "ブラウザまたはページの開き方が Web Serial API の条件を満たしていません。",
      actions: [
        "PC の Chrome または Edge で開く",
        "localhost、127.0.0.1、または HTTPS から開く",
        "ブラウザのサイト設定で serial port permission を許可する",
      ],
      rawMessage,
    };
  }

  if (kind === "bluetooth") {
    return {
      summary: "Bluetooth 接続に失敗しました",
      detail: "Bluetooth Direct は実験的対応です。ZMK Studio 用 device が見えない場合は USB を使ってください。",
      actions: [
        "通常のキーボード接続ではなく ZMK Studio 用 device を選ぶ",
        "KobitoKey を Bluetooth 接続待ち状態にする",
        "安定して設定する場合は USB Direct を使う",
      ],
      rawMessage,
    };
  }

  return {
    summary: `${kind.toUpperCase()} 接続に失敗しました`,
    detail: "接続処理が途中で失敗しました。下の詳細を確認して、接続条件を見直してください。",
    actions: [
      "USB data cable と接続先 device を確認する",
      "ZMK Studio 対応 firmware が入っているか確認する",
      "一度切断してから再接続する",
    ],
    rawMessage,
  };
}

function formatDirectConnectionStatus(issue: DirectConnectionIssue): string {
  return `${issue.summary}: ${issue.detail}`;
}

function isUsbPortOpenFailure(message: string): boolean {
  return (
    message.includes("failed to open the serial port") ||
    message.includes("in use by another process") ||
    message.includes("resource busy") ||
    message.includes("permission denied") ||
    message.includes("access denied") ||
    message.includes("device or resource busy") ||
    message.includes("cannot open") ||
    message.includes("could not open")
  );
}

function isNoUsbDeviceFailure(message: string): boolean {
  return (
    message.includes("studio device が見つかりません") ||
    message.includes("usb direct mode requires a serial port path") ||
    message.includes("usb trackball direct requires a serial port path") ||
    message.includes("missing_port") ||
    message.includes("no port selected") ||
    message.includes("notfounderror")
  );
}

function isStudioUnlockFailure(message: string): boolean {
  return (
    message.includes("studio unlock") ||
    message.includes("did not allow reading behaviors") ||
    message.includes("getbehaviordetails")
  );
}

const BINDING_KIND_OPTIONS: Array<{ value: BindingKind; label: string }> = [
  { value: "key", label: "通常キー" },
  { value: "layer-tap", label: "Tap/Hold Layer" },
  { value: "mod-tap", label: "Tap/Hold Mod" },
  { value: "momentary", label: "Layer 押下中" },
  { value: "to-layer", label: "Layer 移動" },
  { value: "mouse", label: "Mouse" },
  { value: "bluetooth", label: "Bluetooth" },
  { value: "raw", label: "ZMK 直接入力" },
];

function KeyboardGrid({
  combos,
  draftKeyIndexes,
  layer,
  selectedComboId,
  selectedKeyIndex,
  onComboSelect,
  onSelect,
}: {
  combos: KeymapCombo[];
  draftKeyIndexes?: Set<number>;
  layer?: KeymapLayer;
  selectedComboId: string | null;
  selectedKeyIndex: number;
  onComboSelect: (comboId: string) => void;
  onSelect: (index: number) => void;
}) {
  return (
    <div
      className="keyboard-viewport"
      style={
        {
          "--layout-width": `${LAYOUT_WIDTH}px`,
          "--layout-height": `${LAYOUT_HEIGHT}px`,
        } as React.CSSProperties
      }
    >
      <div className="keyboard-scroll-content">
        <div className="keyboard-layout">
          <svg className="base-outline matrix-base-outline" viewBox={`0 0 ${LAYOUT_WIDTH} 540`} aria-hidden="true">
            <path d={matrixBasePath} />
            <path d={matrixBasePath} transform={rightMirrorTransform} />
          </svg>
          <svg className="base-outline thumb-base-outline" viewBox={`0 0 ${LAYOUT_WIDTH} 540`} aria-hidden="true">
            <path d={trackballBasePath} />
            <path d={thumbBasePath} />
            <path d={trackballBasePath} transform={rightMirrorTransform} />
            <path d={thumbBasePath} transform={rightMirrorTransform} />
          </svg>
          {trackballs.map((trackball) => (
            <div
              key={trackball.side}
              className={`trackball ${trackball.side}`}
              style={{
                left: trackball.x,
                top: trackball.y,
                transform: `rotate(${trackball.rotation}deg)`,
              }}
            >
              <i className="track-button" />
              <i className="track-led led-a" />
              <span />
            </div>
          ))}
          <ComboOverlay
            combos={combos}
            selectedComboId={selectedComboId}
            selectedKeyIndex={selectedKeyIndex}
            onSelect={onComboSelect}
          />
          {kobitoKeyPhysicalLayout.map((key) => (
            <PhysicalKeyButton
              key={`${key.side}-${key.index}`}
              binding={layer?.bindings[key.index] ?? ""}
              index={key.index}
              isDraft={draftKeyIndexes?.has(key.index) ?? false}
              isSelected={key.index === selectedKeyIndex}
              kind={key.kind}
              left={key.x}
              rotation={key.rotation ?? 0}
              side={key.side}
              top={key.y}
              width={key.width ?? KEY_UNIT}
              height={key.height ?? KEY_UNIT}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PhysicalKeyButton({
  binding,
  height,
  index,
  isDraft,
  isSelected,
  kind,
  left,
  onSelect,
  rotation,
  side,
  top,
  width,
}: {
  binding: string;
  height: number;
  index: number;
  isDraft: boolean;
  isSelected: boolean;
  kind: string;
  left: number;
  onSelect: (index: number) => void;
  rotation: number;
  side: string;
  top: number;
  width: number;
}) {
  const display = bindingDisplay(binding);
  // Describe the key for screen readers: position + intent + state, so the
  // selected/draft state is conveyed by more than color alone.
  const stateLabel = [isSelected ? "選択中" : null, isDraft ? "書き込み予定" : null].filter(Boolean).join(", ");
  const ariaLabel = `キー ${index + 1}: ${bindingIntentSummary(binding)}${stateLabel ? `（${stateLabel}）` : ""}`;

  return (
    <button
      type="button"
      key={`${side}-${index}`}
      className={`physical-key ${side} ${kind} ${isDraft ? "draft" : ""} ${isSelected ? "selected" : ""}`}
      style={{
        left,
        top,
        width,
        height,
        transform: `rotate(${rotation}deg)`,
      }}
      title={binding}
      aria-label={ariaLabel}
      aria-pressed={isSelected}
      data-draft={isDraft ? "true" : undefined}
      onClick={() => onSelect(index)}
    >
      <span className="key-index">{index + 1}</span>
      <span className="key-content">
        {display.badge ? <em>{display.badge}</em> : null}
        <strong>{display.label}</strong>
      </span>
    </button>
  );
}

function ComboOverlay({
  combos,
  onSelect,
  selectedComboId,
  selectedKeyIndex,
}: {
  combos: KeymapCombo[];
  onSelect: (comboId: string) => void;
  selectedComboId: string | null;
  selectedKeyIndex: number;
}) {
  const visibleCombos = React.useMemo(
    () =>
      combos
        .map((combo) => makeComboViz(combo))
        .filter((combo): combo is ComboViz => Boolean(combo)),
    [combos],
  );

  return (
    <svg
      className="combo-overlay"
      viewBox={`0 0 ${LAYOUT_WIDTH} ${LAYOUT_HEIGHT}`}
      aria-label="Combo map"
    >
      {visibleCombos.map((combo) => {
        const isSelected = combo.id === selectedComboId;
        const isRelated = combo.keyPositions.includes(selectedKeyIndex);
        return (
          <g
            key={combo.id}
            className={`combo-link ${isSelected ? "selected" : ""} ${isRelated ? "related" : ""}`}
          >
            {combo.segments.map((segment, index) => (
              <path key={index} d={segment} />
            ))}
            {combo.points.map((point, index) => (
              <circle key={index} cx={point.x} cy={point.y} r="4.2" />
            ))}
            <g
              className="combo-label"
              role="button"
              tabIndex={0}
              aria-label={`コンボ ${combo.label.text}${isSelected ? "（選択中）" : ""}`}
              aria-pressed={isSelected}
              onClick={() => onSelect(combo.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(combo.id);
                }
              }}
            >
              <rect
                x={combo.label.x - combo.label.width / 2}
                y={combo.label.y - 13}
                width={combo.label.width}
                height="26"
                rx="7"
                ry="7"
              />
              <text x={combo.label.x} y={combo.label.y}>
                {combo.label.text}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

type ComboViz = {
  id: string;
  keyPositions: number[];
  label: {
    text: string;
    width: number;
    x: number;
    y: number;
  };
  points: Array<{ x: number; y: number }>;
  segments: string[];
};

const physicalKeyByIndex = new Map(kobitoKeyPhysicalLayout.map((key) => [key.index, key]));

function makeComboViz(combo: KeymapCombo): ComboViz | undefined {
  const points = combo.keyPositions
    .flatMap((position) => {
      const key = physicalKeyByIndex.get(position);
      return key
        ? [
            {
              x: key.x + key.width / 2,
              y: key.y + key.height / 2,
            },
          ]
        : [];
    });

  if (points.length < 2) {
    return undefined;
  }

  const orderedPoints = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const center = {
    x: orderedPoints.reduce((total, point) => total + point.x, 0) / orderedPoints.length,
    y: orderedPoints.reduce((total, point) => total + point.y, 0) / orderedPoints.length,
  };
  const segments = orderedPoints.slice(1).map((point, index) => {
    const start = orderedPoints[index];
    return `M ${start.x} ${start.y} L ${point.x} ${point.y}`;
  });
  const display = bindingDisplay(combo.binding);
  const text = truncateComboLabel([display.badge, display.label].filter(Boolean).join(" "), 12);

  return {
    id: combo.id,
    keyPositions: combo.keyPositions,
    label: {
      text,
      width: Math.max(34, Math.min(86, text.length * 7 + 16)),
      x: center.x,
      y: center.y,
    },
    points: orderedPoints,
    segments,
  };
}

function truncateComboLabel(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function DirectSummaryPanel({
  connectionKind,
  firmwareComboDiffs,
  firmwareDiffs,
  keymap,
  onApplyFirmwareComboDiffs,
  onApplyFirmwareDiffs,
  portPath,
}: {
  connectionKind: StudioConnectionKind;
  firmwareComboDiffs: DirectFirmwareComboDiff[];
  firmwareDiffs: DirectFirmwareKeyDiff[];
  keymap: StudioKeymap | null;
  onApplyFirmwareComboDiffs: (diffs?: DirectFirmwareComboDiff[]) => void;
  onApplyFirmwareDiffs: (diffs?: DirectFirmwareKeyDiff[]) => void;
  portPath: string;
}) {
  const [syncTab, setSyncTab] = React.useState<"summary" | "key" | "combo">("summary");

  if (!keymap) {
    return (
      <section className="direct-summary">
        <div className="panel-heading compact">
          <h3>Direct モード</h3>
          <span>未接続</span>
        </div>
        <p>上部の Direct で device を検出して読み込むと、実機の keymap がここに表示されます。</p>
      </section>
    );
  }

  const syncTabs: Array<{ id: typeof syncTab; label: string; count?: number }> = [
    { id: "summary", label: "概要" },
    { id: "key", label: "Key 差分", count: firmwareDiffs.length },
    { id: "combo", label: "Combo 差分", count: firmwareComboDiffs.length },
  ];

  return (
    <section className="direct-summary">
      {/* Segmented "Sync" region: Summary / Key diff / Combo diff share one panel
          so only the active region renders instead of stacking all three. */}
      <div className="workbench-tablist direct-sync-tablist" role="tablist" aria-label="Direct sync">
        {syncTabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            role="tab"
            aria-selected={tab.id === syncTab}
            className={tab.id === syncTab ? "active" : ""}
            onClick={() => setSyncTab(tab.id)}
          >
            <span>{tab.label}</span>
            {typeof tab.count === "number" ? <em>{tab.count}</em> : null}
          </button>
        ))}
      </div>

      {syncTab === "summary" ? (
        <dl>
          <div>
            <dt>デバイス</dt>
            <dd>{keymap.deviceName || "不明な ZMK デバイス"}</dd>
          </div>
          <div>
            <dt>{connectionKind === "usb" ? "ポート" : "接続先"}</dt>
            <dd>{portPath || "-"}</dd>
          </div>
          <div>
            <dt>ロック</dt>
            <dd>{keymap.lockState}</dd>
          </div>
          <div>
            <dt>保存状態</dt>
            <dd>{keymap.hasUnsavedChanges ? "未保存あり" : "自動保存済み"}</dd>
          </div>
          <div>
            <dt>Key 差分</dt>
            <dd>{firmwareDiffs.length === 0 ? "差分なし" : `${firmwareDiffs.length} keys`}</dd>
          </div>
          <div>
            <dt>Combo 差分</dt>
            <dd>{firmwareComboDiffs.length === 0 ? "差分なし" : `${firmwareComboDiffs.length} combos`}</dd>
          </div>
        </dl>
      ) : null}
      {syncTab === "key" ? (
        <DirectFirmwareDiffPanel diffs={firmwareDiffs} onApplyFirmwareDiffs={onApplyFirmwareDiffs} />
      ) : null}
      {syncTab === "combo" ? (
        <DirectFirmwareComboDiffPanel diffs={firmwareComboDiffs} onApplyFirmwareComboDiffs={onApplyFirmwareComboDiffs} />
      ) : null}
    </section>
  );
}

function DirectFirmwareDiffPanel({
  diffs,
  onApplyFirmwareDiffs,
}: {
  diffs: DirectFirmwareKeyDiff[];
  onApplyFirmwareDiffs: (diffs?: DirectFirmwareKeyDiff[]) => void;
}) {
  return (
    <section className="direct-firmware-diff-panel">
      <div className="panel-heading compact">
        <div>
          <h3>Firmware との差分</h3>
          <span>{diffs.length === 0 ? "同期済み" : `${diffs.length} keys`}</span>
        </div>
        <button
          type="button"
          className="primary compact-action"
          disabled={diffs.length === 0}
          onClick={() => onApplyFirmwareDiffs(diffs)}
        >
          <UploadCloud size={15} />
          キー差分を Firmware に取り込む
        </button>
      </div>
      {diffs.length === 0 ? (
        <p className="diff-empty compact-empty">Direct keymap と firmware keymap のキー動作は一致しています。</p>
      ) : (
        <>
          <p className="direct-firmware-note">
            Direct 側のキー動作を firmware keymap に取り込みます。保存または書き出しは Firmware モードで実行します。
          </p>
          <div className="direct-firmware-diff-list">
            {diffs.map((diff) => (
              <article key={`${diff.layerIndex}-${diff.keyIndex}`}>
                <header>
                  <div>
                    <strong>
                      Layer {diff.layerIndex} / Key {diff.keyIndex + 1}
                    </strong>
                    <span>{diff.layerName}</span>
                  </div>
                  <button type="button" className="compact-action" onClick={() => onApplyFirmwareDiffs([diff])}>
                    <UploadCloud size={14} />
                    このキー差分を取り込む
                  </button>
                </header>
                <dl>
                  <BindingDiffValue label="Firmware" binding={diff.firmwareBinding} />
                  <BindingDiffValue label="Direct" binding={diff.directBinding} />
                </dl>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function DirectFirmwareComboDiffPanel({
  diffs,
  onApplyFirmwareComboDiffs,
}: {
  diffs: DirectFirmwareComboDiff[];
  onApplyFirmwareComboDiffs: (diffs?: DirectFirmwareComboDiff[]) => void;
}) {
  return (
    <section className="direct-firmware-diff-panel">
      <div className="panel-heading compact">
        <div>
          <h3>Firmware Combo との差分</h3>
          <span>{diffs.length === 0 ? "同期済み" : `${diffs.length} combos`}</span>
        </div>
        <button
          type="button"
          className="primary compact-action"
          disabled={diffs.length === 0}
          onClick={() => onApplyFirmwareComboDiffs(diffs)}
        >
          <UploadCloud size={15} />
          Combo 差分を Firmware に取り込む
        </button>
      </div>
      {diffs.length === 0 ? (
        <p className="diff-empty compact-empty">Direct Combo と firmware combo は一致しています。</p>
      ) : (
        <>
          <p className="direct-firmware-note">
            Direct 側の Combo を firmware keymap に取り込みます。既存 firmware combo の id は保持します。
          </p>
          <div className="direct-firmware-diff-list">
            {diffs.map((diff) => (
              <article key={`${diff.kind}-${diff.comboIndex}`}>
                <header>
                  <div>
                    <strong>
                      Combo {diff.comboIndex + 1} / {comboDiffKindLabel(diff.kind)}
                    </strong>
                    <span>{diff.directCombo?.id ?? diff.firmwareCombo?.id ?? "-"}</span>
                  </div>
                  <button type="button" className="compact-action" onClick={() => onApplyFirmwareComboDiffs([diff])}>
                    <UploadCloud size={14} />
                    この Combo 差分を取り込む
                  </button>
                </header>
                <dl>
                  <div>
                    <dt>Firmware</dt>
                    <dd>
                      <ComboSnapshotView combo={diff.firmwareCombo} />
                    </dd>
                  </div>
                  <div>
                    <dt>Direct</dt>
                    <dd>
                      <ComboSnapshotView combo={diff.directCombo} />
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function BindingDiffValue({ binding, label }: { binding: string; label: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <BindingChip binding={binding} />
      </dd>
    </div>
  );
}

function comboDiffKindLabel(kind: DirectFirmwareComboDiff["kind"]): string {
  switch (kind) {
    case "added":
      return "追加";
    case "removed":
      return "削除";
    case "changed":
      return "変更";
  }
}

function ComboSnapshotView({ combo }: { combo: DirectFirmwareComboDiff["directCombo"] }) {
  if (!combo) {
    return <span className="combo-snapshot-empty">-</span>;
  }
  return (
    <div className="combo-snapshot">
      <BindingChip binding={combo.binding} />
      <div className="combo-snapshot-meta">
        <span>keys {combo.keyPositions.map((position) => position + 1).join(" + ")}</span>
        <span>{combo.timeoutMs}ms</span>
      </div>
    </div>
  );
}

type BindingTone = "default" | "transparent" | "none" | "unknown" | "custom";

function BindingChip({ binding, compact = false }: { binding: string; compact?: boolean }) {
  const display = bindingDisplay(binding);
  const tone = bindingTone(binding);
  const label = displayBindingLabel(binding, display.label);
  return (
    <span className={`binding-chip ${tone} ${compact ? "compact" : ""}`} title={binding}>
      {display.badge ? <span className="binding-chip-badge">{display.badge}</span> : null}
      <strong>{label}</strong>
      {!compact ? <code>{formatBindingForDisplay(binding)}</code> : null}
    </span>
  );
}

function bindingTone(binding: string): BindingTone {
  const behavior = binding.trim().split(/\s+/)[0] ?? "";
  if (behavior === "&trans") {
    return "transparent";
  }
  if (behavior === "&none") {
    return "none";
  }
  if (behavior === "&unknown") {
    return "unknown";
  }
  if (
    behavior &&
    ![
      "&bootloader",
      "&bt",
      "&caps_word",
      "&gresc",
      "&key_repeat",
      "&kp",
      "&kt",
      "&lt",
      "&mkp",
      "&mmv",
      "&mo",
      "&msc",
      "&mt",
      "&sk",
      "&sl",
      "&soft_off",
      "&studio_unlock",
      "&sys_reset",
      "&to",
      "&tog",
    ].includes(behavior)
  ) {
    return "custom";
  }
  return "default";
}

function displayBindingLabel(binding: string, label: string): string {
  const behavior = binding.trim().split(/\s+/)[0] ?? "";
  if (behavior === "&trans") {
    return "透過";
  }
  if (behavior === "&none") {
    return "未割当";
  }
  if (behavior === "&unknown") {
    return "Unknown";
  }
  return label;
}

function ToastViewport({ onDismiss, toast }: { onDismiss: () => void; toast: ToastMessage | null }) {
  if (!toast) {
    return null;
  }

  const icon =
    toast.kind === "writing" ? (
      <Loader2 size={16} />
    ) : toast.kind === "success" ? (
      <CheckCircle2 size={16} />
    ) : toast.kind === "error" ? (
      <AlertTriangle size={16} />
    ) : (
      <SlidersHorizontal size={16} />
    );

  return (
    <div className="toast-viewport" role="status" aria-live={toast.kind === "error" ? "assertive" : "polite"}>
      <div className={`app-toast ${toast.kind}`}>
        {icon}
        <span>{toast.message}</span>
        <button type="button" onClick={onDismiss} aria-label="通知を閉じる">
          x
        </button>
      </div>
    </div>
  );
}

function KeymapParseWarningPanel({ warnings }: { warnings: KeymapParseWarning[] }) {
  return (
    <div className="keymap-parse-warning" role="status" aria-live="polite" aria-atomic="true">
      <div className="keymap-parse-warning-heading">
        <AlertTriangle size={16} />
        <strong>読み込めなかったレイヤーがあります</strong>
      </div>
      <span>キー数が KobitoKey の 40 キー構成と一致しないレイヤーは、誤編集を避けるため編集対象から外しています。</span>
      <ul>
        {warnings.map((warning) => (
          <li key={`${warning.kind}-${warning.id}-${warning.blockStart}`}>
            <code>{warning.id}</code>
            <span>
              {warning.label}: {warning.actualBindings}/{warning.expectedBindings} keys
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DirectConnectionBar({
  comboSource,
  connectionKind,
  connectionState,
  isDesktopRuntime,
  keymap,
  portPath,
}: {
  comboSource: DirectComboSource;
  connectionKind: StudioConnectionKind;
  connectionState: StudioConnectionState;
  isDesktopRuntime: boolean;
  keymap: StudioKeymap | null;
  portPath: string;
}) {
  return (
    <div className="direct-connection-bar">
      <div className="direct-connection-main">
        <div>
          <p className="eyebrow">接続中のキーボード</p>
          <strong>{keymap?.deviceName || "ZMK Studio デバイス"}</strong>
        </div>
        <div className="direct-connection-meta">
          <span>{connectionKind.toUpperCase()}</span>
          <span>{portPath || "デバイス未選択"}</span>
          <span>{keymap ? `${keymap.layers.length} レイヤー` : "未読み込み"}</span>
          <span>{connectionState === "connected" ? keymap?.lockState ?? "不明" : "未接続"}</span>
        </div>
      </div>
      <DirectCapabilityStrip
        compact
        comboSource={comboSource}
        isDesktopRuntime={isDesktopRuntime}
      />
    </div>
  );
}

function DirectPendingChangesBar({
  canWrite,
  changes,
  isWriting,
  onDiscardAll,
  onDiscardSelected,
  onWriteAll,
  onWriteSelected,
  selectedDraft,
}: {
  canWrite: boolean;
  changes: DirectKeyDraft[];
  isWriting: boolean;
  onDiscardAll: () => void;
  onDiscardSelected: () => void;
  onWriteAll: () => void;
  onWriteSelected: () => void;
  selectedDraft?: DirectKeyDraft;
}) {
  const hasChanges = changes.length > 0;
  const writeDisabled = !canWrite || !hasChanges || isWriting;

  return (
    <div className={`direct-pending-bar ${hasChanges ? "has-changes" : ""}`}>
      <div>
        <span>{hasChanges ? `未書き込み ${changes.length} keys` : "未書き込み変更なし"}</span>
        <strong>
          {selectedDraft
            ? `選択中: Layer ${selectedDraft.layerIndex} / Key ${selectedDraft.keyIndex + 1}`
            : hasChanges
              ? "色付きのキーが下書き変更です"
              : "キー編集は下書きに入り、まとめて書き込めます"}
        </strong>
        {hasChanges ? (
          <small>
            {changes
              .slice(0, 3)
              .map((change) => `L${change.layerIndex}/K${change.keyIndex + 1}: ${formatBindingForDisplay(change.to)}`)
              .join(" · ")}
            {changes.length > 3 ? ` · +${changes.length - 3}` : ""}
          </small>
        ) : null}
      </div>
      <div className="direct-pending-actions">
        <div className="direct-pending-group" role="group" aria-label="下書きを破棄">
          <button
            type="button"
            className="danger-ghost"
            disabled={!selectedDraft || isWriting}
            onClick={onDiscardSelected}
            title="選択中のキーの下書きを破棄します"
          >
            <Undo2 size={14} />
            選択を破棄
          </button>
          <button
            type="button"
            className="danger-ghost"
            disabled={!hasChanges || isWriting}
            onClick={onDiscardAll}
            title="すべての下書きを破棄します"
          >
            <Trash2 size={14} />
            すべて破棄
          </button>
        </div>
        <span className="direct-pending-divider" aria-hidden="true" />
        <div className="direct-pending-group" role="group" aria-label="キーボードへ書き込み">
          <button
            type="button"
            className="primary-ghost"
            disabled={!selectedDraft || !canWrite || isWriting}
            onClick={onWriteSelected}
            title="選択中のキーの下書きをキーボードへ書き込みます"
          >
            <Save size={14} />
            選択を書き込み
          </button>
          <button
            type="button"
            className="primary"
            disabled={writeDisabled}
            onClick={onWriteAll}
            title="すべての下書きをキーボードへ書き込みます"
          >
            {isWriting ? <Loader2 size={15} /> : <Save size={15} />}
            すべて書き込み
          </button>
        </div>
      </div>
    </div>
  );
}

function DirectCapabilityStrip({
  compact = false,
  comboSource,
  isDesktopRuntime,
  keyWritable = true,
}: {
  compact?: boolean;
  comboSource?: DirectComboSource;
  isDesktopRuntime: boolean;
  keyWritable?: boolean;
}) {
  const comboState = comboSource === undefined || comboSource === "device"
      ? { className: "ok", label: "書込可" }
      : comboSource === "firmware"
        ? { className: "read", label: "参照中" }
        : { className: "pending", label: "確認中" };
  const trackballState = { className: "read", label: "未対応" };

  return (
    <ul className={`direct-capability-strip ${compact ? "compact" : ""}`} aria-label="この環境でできること">
      <li>
        <span className="capability-label">キー割り当て</span>
        <span className={`capability-state ${keyWritable ? "ok" : "pending"}`}>
          {keyWritable ? "書込可" : "要接続"}
        </span>
      </li>
      <li>
        <span className="capability-label">コンボ</span>
        <span className={`capability-state ${comboState.className}`}>{comboState.label}</span>
      </li>
      <li>
        <span className="capability-label">トラックボール</span>
        <span className={`capability-state ${trackballState.className}`}>{trackballState.label}</span>
      </li>
    </ul>
  );
}

function DirectConnectionErrorPanel({ issue }: { issue: DirectConnectionIssue }) {
  return (
    <div className="runtime-warning">
      <strong>{issue.summary}</strong>
      <span>{issue.detail}</span>
      <ol className="runtime-actions">
        {issue.actions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ol>
      <small>{issue.rawMessage}</small>
    </div>
  );
}

function FirmwareProjectLoadingState({ status }: { status: string }) {
  return (
    <section className="direct-welcome">
      <div className="direct-welcome-card">
        <div>
          <p className="eyebrow">Firmware Mode</p>
          <h2>Firmware ファイルを読み込み中</h2>
          <p>{status}</p>
        </div>
        <div className="runtime-warning">
          <Loader2 size={17} className="spin" />
          <span>同梱 fixture を確認しています。</span>
        </div>
      </div>
    </section>
  );
}

function FirmwareProjectEmptyState({ onBuildFlash, status }: { onBuildFlash: () => void; status: string }) {
  return (
    <section className="direct-welcome">
      <div className="direct-welcome-card">
        <div>
          <p className="eyebrow">Firmware Mode</p>
          <h2>Firmware ファイルを読み込めませんでした</h2>
          <p>{status}</p>
        </div>
        <div className="runtime-warning">
          <AlertTriangle size={17} />
          <span>同梱 fixture が壊れているか、配信アセットから取得できません。</span>
        </div>
        <button type="button" className="primary wide-action" onClick={onBuildFlash}>
          <UploadCloud size={17} />
          Build & Flash
        </button>
      </div>
    </section>
  );
}

function DirectWelcome({
  bluetoothDevices,
  canUseWebBluetooth,
  canUseWebUsb,
  connectionError,
  connectionKind,
  connectionState,
  isDesktopRuntime,
  onBluetoothDeviceChange,
  onConnect,
  onPortChange,
  onRefresh,
  onTransportChange,
  ports,
  selectedBluetoothDevice,
  selectedPort,
}: {
  bluetoothDevices: StudioBluetoothDevice[];
  canUseWebBluetooth: boolean;
  canUseWebUsb: boolean;
  connectionError: DirectConnectionIssue | null;
  connectionKind: StudioConnectionKind;
  connectionState: StudioConnectionState;
  isDesktopRuntime: boolean;
  onBluetoothDeviceChange: (deviceId: string) => void;
  onConnect: (kind: StudioConnectionKind) => void;
  onPortChange: (port: string) => void;
  onRefresh: () => void;
  onTransportChange: (kind: StudioConnectionKind) => void;
  ports: StudioPort[];
  selectedBluetoothDevice: string;
  selectedPort: string;
}) {
  const canUseAnyWebConnection = canUseWebUsb || canUseWebBluetooth;
  const isConnecting = connectionState === "connecting";
  const webDiagnostics = getWebRuntimeDiagnostics(isDesktopRuntime);
  const selectedTransportAvailable = isDesktopRuntime || (connectionKind === "usb" ? canUseWebUsb : canUseWebBluetooth);
  const connectDisabled = isConnecting || !selectedTransportAvailable;

  return (
    <section className="direct-welcome">
      <div className="direct-welcome-card">
        <div>
          <p className="eyebrow">Direct Mode</p>
          <h2>キーボードを接続</h2>
          <p>
            USB 推奨です。Bluetooth も使えますが、ZMK Studio 用のデバイスが表示される場合のみ接続できます。読み込んだ後は、
            複数の key を書き込み予定として調整してから、まとめて実機へ書き込めます。
          </p>
        </div>
        <ol className="direct-connect-steps">
          <li>
            <strong>1</strong>
            <span>USB data cable で接続します。Bluetooth は ZMK Studio 用 device が見える場合だけ使います。</span>
          </li>
          <li>
            <strong>2</strong>
            <span>接続方法を選び、{isDesktopRuntime ? "必要なら device を検出してから" : "ブラウザの選択ダイアログで"} KobitoKey を選びます。</span>
          </li>
          <li>
            <strong>3</strong>
            <span>読み込み後に key を選び、右側の Key Config で書き込み予定に追加してからまとめて書き込みます。</span>
          </li>
        </ol>
        <div className="direct-connect-controls">
          {!isDesktopRuntime && !canUseAnyWebConnection ? (
            <div className="runtime-warning">
              <strong>Web device API が見えていません</strong>
              <span>Chrome/Edgeで、localhost または HTTPS から開いてください。ブラウザ版では事前一覧検出ではなく、Connectボタンで接続ダイアログを開きます。</span>
            </div>
          ) : null}
          {!isDesktopRuntime && canUseAnyWebConnection ? (
            <div className="runtime-notice">
              <strong>USB 接続を推奨します</strong>
              <span>Bluetooth は実験的対応です。通常のキーボード接続ではなく、ZMK Studio 用として表示されるデバイスが見つかる場合だけ使えます。見つからない場合は USB を選んでください。</span>
            </div>
          ) : null}
          {!isDesktopRuntime ? (
            <div className="runtime-diagnostics" aria-label="Web runtime diagnostics">
              <span>secure: {webDiagnostics.secure ? "yes" : "no"}</span>
              <span>serial: {webDiagnostics.serial ? "yes" : "no"}</span>
              <span>bluetooth: {webDiagnostics.bluetooth ? "yes" : "no"}</span>
              <span>url: {webDiagnostics.url}</span>
            </div>
          ) : null}
          {connectionState === "error" && connectionError ? (
            <DirectConnectionErrorPanel issue={connectionError} />
          ) : null}
          <div className="direct-connect-grid">
            <label className="connect-transport-field">
              <span>接続方法</span>
              <select
                id="direct-connection-kind"
                name="directConnectionKind"
                value={connectionKind}
                disabled={isConnecting}
                onChange={(event) => onTransportChange(event.target.value as StudioConnectionKind)}
              >
                <option value="usb">USB</option>
                <option value="bluetooth">Bluetooth</option>
              </select>
            </label>
            {isDesktopRuntime && connectionKind === "usb" ? (
              <label>
                USB デバイス
                <select
                  id="direct-usb-device"
                  name="directUsbDevice"
                  value={selectedPort}
                  onChange={(event) => onPortChange(event.target.value)}
                >
                  <option value="">USB device 未選択</option>
                  {ports.map((port) => (
                    <option key={port.path} value={port.path}>
                      {port.label} ({port.path})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {isDesktopRuntime && connectionKind === "bluetooth" ? (
              <label>
                Bluetooth デバイス
                <select
                  id="direct-bluetooth-device"
                  name="directBluetoothDevice"
                  value={selectedBluetoothDevice}
                  onChange={(event) => onBluetoothDeviceChange(event.target.value)}
                >
                  <option value="">Bluetooth device 未選択</option>
                  {bluetoothDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {!selectedTransportAvailable ? (
            <div className="runtime-warning">
              <strong>{connectionKind === "usb" ? "Web Serial" : "Web Bluetooth"} が使えません</strong>
              <span>Chrome/Edge と localhost/HTTPS の条件を確認し、利用できる接続方法を選んでください。</span>
            </div>
          ) : null}
          <div className="direct-connect-actions">
            <button
              type="button"
              className={`primary connect-action ${connectionKind === "bluetooth" ? "bluetooth-action" : ""}`}
              disabled={connectDisabled}
              onClick={() => onConnect(connectionKind)}
            >
              {connectionKind === "bluetooth" ? <Bluetooth size={17} /> : <Usb size={17} />}
              {isConnecting
                ? `${connectionKind === "bluetooth" ? "Bluetooth" : "USB"} 接続中…`
                : `${connectionKind === "bluetooth" ? "Bluetooth" : "USB"} で接続`}
            </button>
            {isDesktopRuntime ? (
              <button type="button" className="connect-secondary" disabled={isConnecting} onClick={onRefresh}>
                <RefreshCw size={17} />
                device 検出
              </button>
            ) : null}
          </div>
        </div>
        <DirectCapabilityStrip
          isDesktopRuntime={isDesktopRuntime}
          keyWritable={selectedTransportAvailable}
        />
        {!isDesktopRuntime ? (
          <p className="direct-capability-note">
            ブラウザ版では key の Direct 書き込みを試せます。コンボとトラックボールは読み込み専用です。USB 接続を推奨します。
          </p>
        ) : null}
      </div>
    </section>
  );
}

function FirmwareKeyInspector({
  binding,
  canApplyBinding,
  keyIndex,
  onDraftChange,
  onApplyBinding,
  selectedBinding,
}: {
  binding: string;
  canApplyBinding: boolean;
  keyIndex: number;
  onDraftChange: (binding: string) => void;
  onApplyBinding: (binding: string) => void;
  selectedBinding: string;
}) {
  return (
    <section className="firmware-inspector firmware-key-inspector">
      <section>
        <p className="eyebrow">Key {keyIndex + 1}</p>
        <h2>{selectedBinding}</h2>
        <BindingEditor
          actionLabel="選択キーに反映"
          binding={binding}
          disabled={!canApplyBinding}
          onApply={onApplyBinding}
          onDraftChange={onDraftChange}
        />
      </section>
    </section>
  );
}

function DirectInspectorTabs({
  binding,
  canOpenFirmwareMode,
  canWriteCombos,
  canEditKey,
  comboError,
  combos,
  comboSource,
  connectionState,
  keyIndex,
  keyWriteFeedback,
  maxCombos,
  onApply,
  onCreateCombo,
  onDeleteCombo,
  onFirmwareMode,
  onPreviewCombo,
  onRefreshCombos,
  onSaveCombo,
  onSelectCombo,
  selectedCombo,
  selectedCombos,
  selectedBinding,
  firmwareTrackball,
}: {
  binding: string;
  canOpenFirmwareMode: boolean;
  canWriteCombos: boolean;
  canEditKey: boolean;
  comboError: string;
  combos: KeymapCombo[];
  comboSource: DirectComboSource;
  connectionState: StudioConnectionState;
  keyIndex: number;
  keyWriteFeedback: DirectKeyWriteFeedback;
  maxCombos: number;
  onApply: (binding: string) => void;
  onCreateCombo: () => void;
  onDeleteCombo: (combo: KeymapCombo) => void;
  onFirmwareMode: () => void;
  onPreviewCombo: (combo: KeymapCombo, input: ComboFormValue, options?: { silent?: boolean }) => void;
  onRefreshCombos: () => void;
  onSaveCombo: (combo: KeymapCombo, input: ComboFormValue) => void;
  onSelectCombo: (comboId: string) => void;
  selectedCombo?: KeymapCombo;
  selectedCombos: KeymapCombo[];
  selectedBinding: string;
  firmwareTrackball: TrackballSettings;
}) {
  const [activeTab, setActiveTab] = React.useState<"key" | "combo" | "trackball" | "timing">("key");
  const tabLabels: Array<{ id: "key" | "combo" | "trackball" | "timing"; icon: React.ReactNode; label: string }> = [
    { id: "key", icon: <SlidersHorizontal size={13} />, label: "Key Config" },
    { id: "combo", icon: <UploadCloud size={13} />, label: "Combos" },
    { id: "trackball", icon: <MousePointer size={13} />, label: "Trackball" },
    { id: "timing", icon: <Clock size={13} />, label: "Timing" },
  ];
  const activateTab = (tabId: "key" | "combo" | "trackball" | "timing") => {
    setActiveTab(tabId);
  };

  return (
    <section className="direct-inspector">
      <div className="direct-inspector-tabs" role="tablist" aria-label="Direct settings">
        {tabLabels.map((tab) => (
          <button
            type="button"
            key={tab.id}
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => activateTab(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "key" ? (
        <div className="direct-key-editor">
          <div className="direct-key-editor-heading">
            <div>
              <p className="eyebrow">Key {keyIndex + 1}</p>
              <h2>{selectedBinding}</h2>
            </div>
          </div>
          <BindingEditor
            actionLabel={keyWriteFeedback.kind === "writing" ? "書き込み中..." : "書き込み予定に追加"}
            binding={binding}
            currentBinding={selectedBinding}
            disabled={!canEditKey || keyWriteFeedback.kind === "writing"}
            disabledReason={!canEditKey ? "KobitoKey に接続すると編集できます。" : undefined}
            onApply={onApply}
          />
        </div>
      ) : activeTab === "combo" ? (
        <DirectComboPanel
          canOpenFirmwareMode={canOpenFirmwareMode}
          combos={combos}
          onFirmwareMode={onFirmwareMode}
          onSelect={onSelectCombo}
          selectedCombo={selectedCombo}
          selectedCombos={selectedCombos}
        />
      ) : activeTab === "trackball" ? (
        <DirectTrackballPanel
          canOpenFirmwareMode={canOpenFirmwareMode}
          onFirmwareMode={onFirmwareMode}
          firmwareSettings={firmwareTrackball}
        />
      ) : (
        <DirectTimingPanel />
      )}
    </section>
  );
}

function DirectTrackballPanel({
  canOpenFirmwareMode,
  onFirmwareMode,
  firmwareSettings,
}: {
  canOpenFirmwareMode: boolean;
  onFirmwareMode: () => void;
  firmwareSettings: TrackballSettings;
}) {
  return (
    <div className="direct-settings-panel direct-trackball-panel">
      {/* Consolidated reference notice replaces the former heading blurb +
          combo-write-warning + trailing duplicate button. */}
      <div className="runtime-notice direct-reference-notice">
        <strong>トラックボールは読み込み専用です</strong>
        <span>
          firmware overlay の値を表示しています。現在の firmware ではトラックボールを runtime 保存できないため、変更は
          {canOpenFirmwareMode ? " Firmware Mode" : " デスクトップ版の Firmware Mode"} で左右 overlay を編集し、build + flash で反映します。
        </span>
        {canOpenFirmwareMode ? (
          <button type="button" className="reference-notice-action" onClick={onFirmwareMode}>
            Firmware Mode で編集 →
          </button>
        ) : null}
      </div>

      <div className="trackball-reference-summary" aria-label="Trackball Direct Mode status">
        <div>
          <span>Direct write</span>
          <strong>未対応</strong>
        </div>
        <div>
          <span>表示元</span>
          <strong>Firmware overlay</strong>
        </div>
        <div>
          <span>反映方法</span>
          <strong>build + flash</strong>
        </div>
      </div>

      <div className="trackball-reference-mode">
        <TrackballPanel settings={firmwareSettings} />
      </div>
    </div>
  );
}

function DirectComboPanel({
  canOpenFirmwareMode,
  combos,
  onFirmwareMode,
  onSelect,
  selectedCombo,
  selectedCombos,
}: {
  canOpenFirmwareMode: boolean;
  combos: KeymapCombo[];
  onFirmwareMode?: () => void;
  onSelect: (comboId: string) => void;
  selectedCombo?: KeymapCombo;
  selectedCombos: KeymapCombo[];
}) {
  const firmwareModeName = canOpenFirmwareMode ? "Firmware Mode" : "デスクトップ版の Firmware Mode";
  return (
    <div className="direct-combo-panel">
      {/* One consolidated, on-theme "read-only" notice replaces the former
          duplicated combo-write-warning blocks (connected / disconnected). */}
      <div className="runtime-notice direct-reference-notice">
        <strong>コンボは読み込み専用です</strong>
        <span>
          firmware keymap のコンボを表示しています（{combos.length} 件）。変更は
          {` ${firmwareModeName}`} で編集し、build + flash で反映します。
        </span>
        {onFirmwareMode && canOpenFirmwareMode ? (
          <button type="button" className="reference-notice-action" onClick={onFirmwareMode}>
            Firmware Mode で編集 →
          </button>
        ) : null}
      </div>
      <ComboPanel
        combos={combos}
        selectedComboId={selectedCombo?.id ?? null}
        selectedCombos={selectedCombos}
        onSelect={onSelect}
      />
      {selectedCombo ? <ComboReferencePanel combo={selectedCombo} /> : null}
    </div>
  );
}

function ComboReferencePanel({ combo }: { combo?: KeymapCombo }) {
  return (
    <section className="combo-reference-panel">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Combo Detail</p>
          <h2>{combo?.id ?? "未選択"}</h2>
        </div>
      </div>
      {combo ? (
        <div className="combo-editor-summary" aria-label="Combo detail">
          <div>
            <span>Keys</span>
            <strong>{combo.keyPositions.map((position) => position + 1).join(" + ")}</strong>
          </div>
	          <div>
	            <span>動作</span>
	            <strong>{combo.binding}</strong>
	          </div>
	          <div>
	            <span>Layers</span>
	            <strong>{formatComboLayerScope(combo)}</strong>
	          </div>
	          <div>
	            <span>Timeout</span>
	            <strong>{combo.timeoutMs} ms</strong>
          </div>
        </div>
      ) : (
        <p className="empty-note">Combo を選択すると内容を確認できます。</p>
      )}
    </section>
  );
}

function ScaleSlider({
  disabled = false,
  label,
  onChange,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  const presets = [0.5, 0.75, 1, 1.5, 2];
  return (
    <div className="timing-field">
      <div>
        <span>{label}</span>
        <strong>{value.toFixed(2)}x</strong>
      </div>
      <input
        name={`timing-${label}`}
        aria-label={label}
        type="range"
        min={0.25}
        max={3}
        step={0.05}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="timing-presets compact-presets">
        <div>
          {presets.map((preset) => (
            <button
              type="button"
              key={preset}
              className={Math.abs(value - preset) < 0.01 ? "active" : ""}
              disabled={disabled}
              onClick={() => onChange(preset)}
            >
              {preset}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DirectTimingPanel() {
  return (
    <div className="direct-settings-panel timing-panel">
      {/* Consolidated reference notice replaces the former heading blurb + warning. */}
      <div className="runtime-notice direct-reference-notice">
        <strong>Timing は Direct Mode 未対応です</strong>
        <span>
          現在の KobitoKey firmware は tapping term や hold-tap timing を runtime 保存できません。変更する場合は
          firmware 設定ファイルを編集し、build + flash で反映します。
        </span>
      </div>

      <div className="trackball-reference-summary" aria-label="Timing Direct Mode status">
        <div>
          <span>Direct write</span>
          <strong>未対応</strong>
        </div>
        <div>
          <span>表示元</span>
          <strong>なし</strong>
        </div>
        <div>
          <span>反映方法</span>
          <strong>build + flash</strong>
        </div>
      </div>
    </div>
  );
}

function DirectModeNote({ onFirmwareMode }: { onFirmwareMode: () => void }) {
  return (
    <section className="direct-note">
      <p className="eyebrow">Direct Mode</p>
      <h2>実機 keymap 書き込み</h2>
      <p>
        キー動作は USB 接続した ZMK Studio 対応 device に直接保存されます。combo とトラックボール設定は
        Firmware Mode で編集して build / flash してください。
      </p>
      <button type="button" className="wide-action" onClick={onFirmwareMode}>
        Firmware Mode を開く
      </button>
    </section>
  );
}

type WorkbenchTabId = "combos" | "trackball" | "build" | "diff";

const WORKBENCH_TABS: Array<{ id: WorkbenchTabId; label: string }> = [
  { id: "combos", label: "Combos" },
  { id: "trackball", label: "Trackball" },
  { id: "diff", label: "Diff" },
];

function FirmwareWorkbenchActions({
  activeTab,
  canReset,
  canSaveProject,
  diffCount,
  onBuildFlash,
  onReset,
  onSaveProject,
  projectSaveMode,
}: {
  activeTab: WorkbenchTabId;
  canReset: boolean;
  canSaveProject: boolean;
  diffCount: number;
  onBuildFlash: () => void;
  onReset: () => void;
  onSaveProject: () => void;
  projectSaveMode: "save" | "export";
}) {
  const isBuildPanelOpen = activeTab === "build";
  const firmwareState = diffCount > 0 ? "Firmware 未保存" : "Firmware 保存済み";
  const diffState = diffCount > 0 ? `Diff ${diffCount}` : "Diff なし";
  const projectSaveLabel = projectSaveMode === "save" ? "Firmwareファイルを保存" : "Firmwareファイルをダウンロード";

  return (
    <div
      className={`firmware-workbench-actions ${isBuildPanelOpen ? "build-open" : "edit-open"}`}
      role="group"
      aria-label="Firmware actions"
    >
      <div className="firmware-action-state" aria-live="polite">
        <span className={diffCount > 0 ? "changed" : "clean"}>{firmwareState}</span>
        <span>{diffState}</span>
      </div>
      <div className="firmware-main-actions">
        {!isBuildPanelOpen ? (
          <button
            type="button"
            className="project-save-action"
            onClick={onSaveProject}
            disabled={!canSaveProject}
            title={projectSaveMode === "save" ? "読み込んだ firmware ファイルへ保存" : "firmware ファイル一式をダウンロード"}
          >
            {projectSaveMode === "save" ? <Save size={16} /> : <Download size={16} />}
            <span className="button-label">{projectSaveLabel}</span>
          </button>
        ) : null}
        <button type="button" className={isBuildPanelOpen ? "primary active" : "primary build-flash-action"} onClick={onBuildFlash}>
          {isBuildPanelOpen ? <Undo2 size={16} /> : <UploadCloud size={16} />}
          <span className="button-label">{isBuildPanelOpen ? "編集に戻る" : "Build & Flash"}</span>
        </button>
      </div>
      <div className="firmware-danger-actions">
        <button type="button" className="danger reset-action" onClick={onReset} disabled={!canReset}>
          <Undo2 size={16} />
          <span className="button-label">編集をリセット</span>
        </button>
      </div>
    </div>
  );
}

function WorkbenchTabs({
  activeTab,
  children,
  comboCount,
  diffCount,
  onTabChange,
}: {
  activeTab: WorkbenchTabId;
  children: React.ReactNode;
  comboCount: number;
  diffCount: number;
  onTabChange: (tab: WorkbenchTabId) => void;
}) {
  const counts: Partial<Record<WorkbenchTabId, number>> = {
    combos: comboCount,
    diff: diffCount,
  };

  return (
    <section className="workbench-tabs">
      <div className="workbench-tablist" role="tablist">
        {WORKBENCH_TABS.map((tab) => {
          const count = counts[tab.id];
          return (
            <button
              type="button"
              key={tab.id}
              role="tab"
              aria-selected={tab.id === activeTab}
              className={tab.id === activeTab ? "active" : ""}
              onClick={() => onTabChange(tab.id)}
            >
              <span>{tab.label}</span>
              {typeof count === "number" ? <em>{count}</em> : null}
            </button>
          );
        })}
      </div>
      <div className="workbench-panel">{children}</div>
    </section>
  );
}

function BackToEditButton({ onBack }: { onBack: () => void }) {
  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button === 0) {
        onBack();
      }
    },
    [onBack],
  );

  return (
    <button type="button" onClick={onBack} onPointerDown={handlePointerDown}>
      <Undo2 size={15} />
      <span className="button-label">編集に戻る</span>
    </button>
  );
}

function ComboWorkbench({
  combos,
  onCreate,
  onDelete,
  onSave,
  onSelect,
  selectedCombo,
  selectedCombos,
}: {
  combos: KeymapCombo[];
  onCreate: () => void;
  onDelete: (combo: KeymapCombo) => void;
  onSave: (combo: KeymapCombo, input: ComboFormValue) => void;
  onSelect: (comboId: string) => void;
  selectedCombo?: KeymapCombo;
  selectedCombos: KeymapCombo[];
}) {
  return (
    <div className="workbench-grid combo-workbench">
      <ComboPanel
        combos={combos}
        selectedComboId={selectedCombo?.id ?? null}
        selectedCombos={selectedCombos}
        onCreate={onCreate}
        onDelete={onDelete}
        onSelect={onSelect}
      />
      <ComboEditor
        combo={selectedCombo}
        key={selectedCombo?.id ?? "empty-combo-editor"}
        onSave={onSave}
        onSelect={onSelect}
      />
    </div>
  );
}

function TrackballWorkbench({
  onApply,
  settings,
}: {
  onApply: (settings: EditableTrackballSettings) => void;
  settings: TrackballSettings;
}) {
  return (
    <div className="workbench-grid trackball-workbench">
      <TrackballPanel settings={settings} />
      <TrackballEditor settings={settings} onApply={onApply} />
    </div>
  );
}

function BrowserFirmwareReleaseWorkbench({
  artifacts,
  branch,
  buildStatus,
  busyOperation,
  canDownloadArtifacts,
  commitSha,
  commitUrl,
  flashError,
  flashSide,
  githubOAuthAvailable,
  onBack,
  onBranchChange,
  onCancelGithubConnection,
  onClearToken,
  onCommitBuild,
  onConnectGithub,
  onCopyUf2,
  onDiffReviewed,
  onDownloadArtifacts,
  onImportArtifactFolder,
  onLoadProject,
  onRefreshRun,
  onRepoUrlChange,
  onTokenChange,
  onTriggerBuild,
  readiness,
  resetDone,
  repoRef,
  repoUrl,
  runId,
  runUrl,
  token,
  userCode,
  verificationUri,
}: {
  artifacts: GitHubFirmwareArtifacts | null;
  branch: string;
  buildStatus: string;
  busyOperation: BrowserFirmwareOperation;
  canDownloadArtifacts: boolean;
  commitSha: string | null;
  commitUrl: string;
  flashError: string;
  flashSide: FlashSide;
  githubOAuthAvailable: boolean;
  onBack: () => void;
  onBranchChange: (value: string) => void;
  onCancelGithubConnection: () => void;
  onClearToken: () => void;
  onCommitBuild: () => void;
  onConnectGithub: () => void;
  onCopyUf2: (side: FlashSide) => void;
  onDiffReviewed: () => void;
  onDownloadArtifacts: () => void;
  onImportArtifactFolder: () => void;
  onLoadProject: () => void;
  onRefreshRun: () => void;
  onRepoUrlChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onTriggerBuild: () => void;
  readiness: FirmwareReleaseReadiness;
  resetDone: Record<FlashSide, boolean>;
  repoRef: GitHubRepositoryRef | null;
  repoUrl: string;
  runId: number | null;
  runUrl: string;
  token: string;
  userCode: string;
  verificationUri: string;
}) {
  const isBusy = busyOperation !== "idle";
  const busyLabel = browserFirmwareOperationLabel(busyOperation);
  const flashTargetArtifactLabel = artifacts ? firmwareArtifactProvenanceLabel(artifacts, flashSide) : "";
  const visibleBuildStatus = isBusy ? `${busyLabel}: ${buildStatus}` : buildStatus;
  const buildStatusTone = classifyBuildStatusTone(visibleBuildStatus, isBusy);
  const BuildStatusIcon = buildStatusTone === "busy" ? Loader2 : buildStatusTone === "error" ? AlertTriangle : buildStatusTone === "success" ? CheckCircle2 : Clock;

  return (
    <div className="workbench-grid build-workbench browser-release-workbench" aria-busy={isBusy}>
      <BrowserFirmwareFlowGuide readiness={readiness} />
      <section className="build-panel">
        <div className="build-panel-heading">
          <div>
            <p className="eyebrow">Browser Firmware</p>
            <h2>GitHub Commit & Build</h2>
          </div>
        </div>
        <label className="build-repo-field" htmlFor="browser-firmware-repository">
          <span>Firmware repository</span>
          <input
            id="browser-firmware-repository"
            name="browserFirmwareRepository"
            type="text"
            placeholder="juichi50iii/KobitoKey_QWERTY"
            value={repoUrl}
            onChange={(event) => onRepoUrlChange(event.target.value)}
            disabled={isBusy}
            spellCheck={false}
            autoComplete="off"
            aria-describedby="browser-firmware-repository-help"
          />
          <small id="browser-firmware-repository-help">
            {repoRef ? `対象: ${formatGitHubRepositoryRef(repoRef)}。このブラウザに保存します。` : "owner/repo または GitHub URL を入力"}
          </small>
        </label>
        <label className="build-repo-field" htmlFor="browser-firmware-branch">
          <span>Branch</span>
          <input
            id="browser-firmware-branch"
            name="browserFirmwareBranch"
            type="text"
            value={branch}
            onChange={(event) => onBranchChange(event.target.value)}
            disabled={isBusy}
            spellCheck={false}
            autoComplete="off"
            aria-describedby="browser-firmware-branch-help"
          />
          <small id="browser-firmware-branch-help">commit と workflow dispatch に使います。このブラウザに保存します。</small>
        </label>
        <label className="build-repo-field" htmlFor="browser-firmware-token">
          <span>GitHub token</span>
          <input
            id="browser-firmware-token"
            name="browserFirmwareToken"
            type="password"
            value={token}
            onChange={(event) => onTokenChange(event.target.value)}
            disabled={isBusy}
            autoComplete="new-password"
            placeholder="fine-grained token / OAuth token"
            aria-describedby="browser-firmware-token-help"
          />
          <small id="browser-firmware-token-help">
            token はメモリ上だけで使います。fine-grained token は Contents write と Actions write を付けます。
          </small>
        </label>
        <div className="build-actions">
          <button
            type="button"
            onClick={onConnectGithub}
            disabled={isBusy || !githubOAuthAvailable}
            aria-describedby={!githubOAuthAvailable ? "browser-firmware-oauth-help" : undefined}
          >
            <UploadCloud size={16} />
            <span className="button-label">GitHub で接続</span>
          </button>
          {userCode ? (
            <button type="button" onClick={onCancelGithubConnection}>
              <span className="button-label">認証をキャンセル</span>
            </button>
          ) : null}
          {token.trim() ? (
            <button type="button" onClick={onClearToken} disabled={isBusy && !userCode}>
              <span className="button-label">token を消去</span>
            </button>
          ) : null}
        </div>
        {!githubOAuthAvailable ? (
          <p className="build-note oauth-config-note" id="browser-firmware-oauth-help">
            GitHub OAuth はこの公開 build では未設定です。GitHub token を入力して読み込み、または公開管理者が OAuth client id
            を設定して再デプロイしてください。
          </p>
        ) : null}
        {userCode ? (
          <p className="build-note">
            GitHub device code: <strong>{userCode}</strong>
            {verificationUri ? (
              <>
                {" / "}
                <a href={verificationUri} target="_blank" rel="noreferrer">
                  GitHub 認証を開く
                </a>
              </>
            ) : null}
          </p>
        ) : null}
        <p className={`build-status ${buildStatusTone}`} role="status" aria-live="polite" aria-atomic="true">
          <BuildStatusIcon size={14} className={buildStatusTone === "busy" ? "spin" : undefined} />
          <span>{visibleBuildStatus}</span>
        </p>
        <BrowserReleaseGateList readiness={readiness} />
        <div className="build-actions">
          <button type="button" onClick={onLoadProject} disabled={isBusy || !token.trim() || !repoRef || !branch.trim()}>
            <Download size={16} />
            <span className="button-label">GitHub から読み込み</span>
          </button>
          <button type="button" onClick={onDiffReviewed} disabled={isBusy || readiness.step !== "review-diff"}>
            <CheckCircle2 size={16} />
            <span className="button-label">Diff 確認済み</span>
          </button>
          <button type="button" className="primary" onClick={onCommitBuild} disabled={isBusy || !readiness.canCommit}>
            <UploadCloud size={16} />
            <span className="button-label">Commit & Build</span>
          </button>
          <button type="button" onClick={onTriggerBuild} disabled={isBusy || !readiness.canBuild}>
            <UploadCloud size={16} />
            <span className="button-label">Build 起動</span>
          </button>
          <button type="button" onClick={onRefreshRun} disabled={isBusy || !readiness.canBuild}>
            <span className="button-label">最新 run</span>
          </button>
          <button type="button" onClick={onDownloadArtifacts} disabled={isBusy || !canDownloadArtifacts}>
            <span className="button-label">Artifact 取得</span>
          </button>
          <button type="button" onClick={onImportArtifactFolder} disabled={isBusy}>
            <FolderOpen size={16} />
            <span className="button-label">Artifact フォルダから再開</span>
          </button>
        </div>
        <div className="browser-release-meta">
          <div className="release-next-action" aria-label="次の操作">
            <span>次の操作</span>
            <strong>{releaseNextActionTitle(readiness)}</strong>
            <small>{releaseNextActionDescription(readiness)}</small>
          </div>
          {commitSha ? (
            <a href={commitUrl || undefined} target="_blank" rel="noreferrer">
              commit {commitSha.slice(0, 7)}
            </a>
          ) : null}
          {runId ? (
            <a href={runUrl || undefined} target="_blank" rel="noreferrer">
              run {runId}
            </a>
          ) : null}
        </div>
      </section>
      <section className="flash-panel">
        <div>
          <p className="eyebrow">Flash</p>
          <h2>UF2 → Bootloader</h2>
        </div>
        <FirmwareWriteGuide />
        <div className="artifact-folder-import">
          <div>
            <strong>Artifact フォルダからFlash</strong>
            <span>GitHub以外で取得したartifactや、以前ダウンロードしたartifactフォルダから左右UF2を読み込めます。</span>
          </div>
          <button type="button" onClick={onImportArtifactFolder} disabled={isBusy}>
            <FolderOpen size={14} />
            <span className="button-label">フォルダを選択</span>
          </button>
        </div>
        <FlashSequenceGuide artifacts={artifacts} readiness={readiness} resetDone={resetDone} />
        <div className="flash-wizard">
          <div className="flash-wizard-header">
            <strong>{sideLabel(flashSide)} 側を書き込み</strong>
            <span>
              {artifacts?.targets[flashSide] ?? "UF2 未検出"}
              {flashTargetArtifactLabel ? ` / ${flashTargetArtifactLabel}` : ""}
            </span>
          </div>
          <FlashWriteError message={flashError} />
          <FlashCompletionStatus activeSide={flashSide} readiness={readiness} />
          <div className="flash-side-toggle" role="group" aria-label="Flash side">
            {(["left", "right"] as FlashSide[]).map((side) => (
              <button
                type="button"
                key={side}
                className={flashSide === side ? "active" : ""}
                disabled={isBusy || (side === "left" ? !readiness.canFlashLeft : !readiness.canFlashRight)}
                onClick={() => onCopyUf2(side)}
              >
                <span className="button-label">
                  {resetDone[side] ? `${sideLabel(side)} firmware を直接コピー` : `${sideLabel(side)} reset を直接コピー`}
                </span>
              </button>
            ))}
          </div>
          <div className="flash-folder-guidance" aria-label="Bootloader コピー先の見分け方">
            <strong>コピー先の見分け方</strong>
            <span>
              {sideLabel(flashSide)} 側を bootloader に入れると出る <code>INFO_UF2.TXT</code> 入りの USB ドライブを選びます。
              先に reset UF2、次に firmware UF2 を Chrome から直接コピーします。
            </span>
          </div>
          <details className="flash-settings-reset-note" open>
            <summary>reset UF2 を先に書き込みます</summary>
            <p>
              artifact 内の reset UF2 で Direct Mode / ZMK Studio の保存設定を消してから、同じ側の firmware UF2 を書き込みます。
              reset 後はもう一度 bootloader に入れて同じボタンを押してください。
            </p>
          </details>
          <small>
            {artifacts
              ? `${firmwareArtifactSideSummary(artifacts, "left")} / ${firmwareArtifactResetSummary(artifacts)} / ${firmwareArtifactSideSummary(artifacts, "right")}${
                  artifacts.manifestPath
                    ? ` / manifest ${artifacts.manifestPath}${firmwareManifestArtifactLabel(artifacts) ? ` (${firmwareManifestArtifactLabel(artifacts)})` : ""}`
                    : ""
                }`
              : "成功した build の artifact を取得すると左右 UF2 を分類します"}
          </small>
        </div>
      </section>
    </div>
  );
}

function firmwareArtifactSideSummary(artifacts: GitHubFirmwareArtifacts, side: FlashSide): string {
  if (!artifacts.targets[side]) {
    return `${side} 未検出`;
  }
  const provenance = firmwareArtifactProvenanceLabel(artifacts, side);
  return `${side} OK${provenance ? ` (${provenance})` : ""}`;
}

function firmwareArtifactResetSummary(artifacts: GitHubFirmwareArtifacts): string {
  if (!artifacts.targets.reset) {
    return "reset 未検出";
  }
  const file = artifacts.files.find((candidate) => candidate.name === artifacts.targets.reset);
  const provenance = formatGitHubArtifactProvenance(file?.artifactName, file?.artifactId);
  return `reset OK${provenance ? ` (${provenance})` : ""}`;
}

function firmwareArtifactProvenanceLabel(artifacts: GitHubFirmwareArtifacts, side: FlashSide): string {
  const targetName = artifacts.targets[side];
  const file = targetName ? artifacts.files.find((candidate) => candidate.name === targetName) : undefined;
  return formatGitHubArtifactProvenance(file?.artifactName, file?.artifactId);
}

function firmwareManifestArtifactLabel(artifacts: GitHubFirmwareArtifacts): string {
  return formatGitHubArtifactProvenance(artifacts.manifestArtifactName, artifacts.manifestArtifactId);
}

function formatGitHubArtifactProvenance(artifactName?: string, artifactId?: number): string {
  if (artifactName && artifactId) return `artifact ${artifactName} #${artifactId}`;
  if (artifactName) return `artifact ${artifactName}`;
  if (artifactId) return `artifact #${artifactId}`;
  return "";
}

type BuildStatusTone = "neutral" | "busy" | "success" | "warning" | "error";
type ReleaseGateState = "done" | "current" | "pending";
type ReleaseFlowStep = {
  detail: string;
  label: string;
  state: ReleaseGateState;
};

/* A static, stateless "where am I" stepper for the overall edit → save → build →
   flash flow. Reuses the release-flow-steps visual so the desktop Build & Flash
   screen and the browser release path share one numbered-step affordance. The
   `current` step is highlighted; everything before it is marked done. */
function FirmwareFlowStepper({ current }: { current: "build" | "flash" }) {
  const steps: Array<{ label: string; detail: string }> = [
    { label: "編集", detail: "keymap / overlay を編集" },
    { label: "保存", detail: "Diff を確認して保存" },
    { label: "Build", detail: "GitHub Actions で UF2 を生成" },
    { label: "Flash", detail: "UF2 を bootloader にコピー" },
  ];
  const currentIndex = current === "build" ? 2 : 3;
  return (
    <section className="release-flow-guide firmware-flow-stepper" aria-label="Build & Flash までの流れ">
      <div className="release-flow-heading">
        <div>
          <p className="eyebrow">Build &amp; Flash</p>
          <h2>編集から Flash までの順番</h2>
        </div>
      </div>
      <ol className="release-flow-steps">
        {steps.map((step, index) => {
          const state: ReleaseGateState = index < currentIndex ? "done" : index === currentIndex ? "current" : "pending";
          const Icon = state === "done" ? CheckCircle2 : state === "current" ? AlertTriangle : Clock;
          return (
            <li className={state} key={step.label} aria-current={state === "current" ? "step" : undefined}>
              <span className="release-flow-index">{index + 1}</span>
              <Icon size={15} />
              <div>
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function BrowserFirmwareFlowGuide({ readiness }: { readiness: FirmwareReleaseReadiness }) {
  const steps = releaseFlowSteps(readiness);

  return (
    <section className="release-flow-guide" aria-label="Flash までの流れ">
      <div className="release-flow-heading">
        <div>
          <p className="eyebrow">Release Flow</p>
          <h2>Flash までの順番</h2>
        </div>
        <p>{releaseFlowSummary(readiness)}</p>
      </div>
      <ol className="release-flow-steps">
        {steps.map((step, index) => {
          const Icon = step.state === "done" ? CheckCircle2 : step.state === "current" ? AlertTriangle : Clock;
          return (
            <li className={step.state} key={step.label} aria-current={step.state === "current" ? "step" : undefined}>
              <span className="release-flow-index">{index + 1}</span>
              <Icon size={15} />
              <div>
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function FlashSequenceGuide({
  artifacts,
  readiness,
  resetDone,
}: {
  artifacts: GitHubFirmwareArtifacts | null;
  readiness: FirmwareReleaseReadiness;
  resetDone: Record<FlashSide, boolean>;
}) {
  const leftState = readiness.leftFlashed || readiness.complete ? "done" : readiness.canFlashLeft ? "current" : "pending";
  const rightState = readiness.rightFlashed || readiness.complete ? "done" : readiness.canFlashRight ? "current" : "pending";
  const artifactReady = Boolean(artifacts?.targets.left && artifacts.targets.reset && artifacts.targets.right);

  return (
    <div className="flash-sequence-guide" aria-label="左右の書き込み順">
      <div className="flash-sequence-intro">
        <strong>{artifactReady ? "reset / firmware UF2 は取得済みです" : "まず左の手順で Artifact 取得まで進めます"}</strong>
        <span>
          各側で reset UF2 を先に直接コピーし、もう一度 bootloader に入れて firmware UF2 を直接コピーします。
        </span>
      </div>
      <ol>
        <FlashSequenceItem
          detail={
            resetDone.left
              ? "Left reset は完了です。左側をもう一度 bootloader にして firmware UF2 を直接コピーします。"
              : "左側を USB bootloader にして、reset UF2 を直接コピーします。"
          }
          label="Left reset → firmware"
          state={leftState}
        />
        <FlashSequenceItem
          detail={
            resetDone.right
              ? "Right reset は完了です。右側をもう一度 bootloader にして firmware UF2 を直接コピーします。"
              : "右側を USB bootloader にして、reset UF2 を直接コピーします。"
          }
          label="Right reset → firmware"
          state={rightState}
        />
      </ol>
    </div>
  );
}

function FlashCompletionStatus({
  activeSide,
  readiness,
}: {
  activeSide: FlashSide;
  readiness: FirmwareReleaseReadiness;
}) {
  const leftDone = readiness.leftFlashed || readiness.complete;
  const rightDone = readiness.rightFlashed || readiness.complete;
  const leftState = leftDone ? "done" : readiness.canFlashLeft ? "current" : "pending";
  const rightState = rightDone ? "done" : readiness.canFlashRight ? "current" : "pending";
  const nextInstruction = flashNextInstruction(readiness, activeSide);

  return (
    <div className="flash-completion-status" aria-label="Flash completion status">
      <div className="flash-completion-row" role="list">
        <FlashCompletionPill label="Left" state={leftState} />
        <FlashCompletionPill label="Right" state={rightState} />
      </div>
      <p>{nextInstruction}</p>
    </div>
  );
}

function FlashWriteError({ message }: { message: string }) {
  if (!message) {
    return null;
  }

  return (
    <div className="flash-write-error" role="alert" aria-live="assertive">
      <AlertTriangle size={15} />
      <div>
        <strong>書き込みエラー</strong>
        <span>{message}</span>
      </div>
    </div>
  );
}

function FlashCompletionPill({ label, state }: { label: string; state: ReleaseGateState }) {
  const Icon = state === "done" ? CheckCircle2 : state === "current" ? AlertTriangle : Clock;
  const text = state === "done" ? "完了" : state === "current" ? "書き込み待ち" : "待機";
  return (
    <span className={`flash-completion-pill ${state}`} role="listitem">
      <Icon size={13} />
      <strong>{label}</strong>
      <small>{text}</small>
    </span>
  );
}

function flashNextInstruction(readiness: FirmwareReleaseReadiness, activeSide: FlashSide) {
  if (readiness.complete) {
    return "左右の書き込みが完了しています。";
  }
  if (readiness.leftFlashed && readiness.canFlashRight) {
    return "Left は完了です。USB を右側へ差し替え、右側を bootloader にして reset UF2 から直接コピーします。";
  }
  if (readiness.rightFlashed && readiness.canFlashLeft) {
    return "Right は完了です。USB を左側へ差し替え、左側を bootloader にして reset UF2 から直接コピーします。";
  }
  if (readiness.canFlashLeft && readiness.canFlashRight) {
    return `${sideLabel(activeSide)} 側を bootloader にして、reset UF2 から直接コピーします。左右どちらからでも書き込めます。`;
  }
  if (readiness.canFlashLeft) {
    return `${sideLabel(activeSide)} 側を bootloader にして、reset UF2 から直接コピーします。`;
  }
  return "Artifact 取得が完了すると、Left から順番に書き込めます。";
}

function FlashSequenceItem({ detail, label, state }: { detail: string; label: string; state: ReleaseGateState }) {
  const Icon = state === "done" ? CheckCircle2 : state === "current" ? AlertTriangle : Clock;
  return (
    <li className={state}>
      <Icon size={14} />
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
    </li>
  );
}

function releaseFlowSteps(readiness: FirmwareReleaseReadiness): ReleaseFlowStep[] {
  const flashLeftState = readiness.leftFlashed || readiness.complete ? "done" : readiness.canFlashLeft ? "current" : "pending";
  const flashRightState = readiness.rightFlashed || readiness.complete ? "done" : readiness.canFlashRight ? "current" : "pending";

  return [
    {
      label: "GitHub 接続と読み込み",
      detail: "token / repository / branch を確認し、GitHub から firmware files を読み込みます。",
      state: releaseFlowGroupState(readiness, ["connect-github", "select-repository", "load-files"], "load-files"),
    },
    {
      label: "編集と Diff 確認",
      detail: "キー、Combo、Trackball を編集し、Diff 確認済みを押します。",
      state: releaseFlowGroupState(readiness, ["edit", "review-diff"], "review-diff", readiness.canCommit || readiness.canBuild),
    },
    {
      label: "Commit & Build",
      detail: "変更を commit して GitHub Actions build を起動します。",
      state: releaseFlowGroupState(
        readiness,
        ["commit", "build"],
        "build",
        readiness.canDownloadArtifact || readiness.canFlashLeft || readiness.canFlashRight || readiness.complete,
      ),
    },
    {
      label: "Artifact 取得",
      detail: "成功した build から left / right UF2 を取得します。",
      state: releaseFlowGroupState(readiness, ["download-artifact"], "download-artifact", readiness.canFlashLeft || readiness.canFlashRight || readiness.complete),
    },
    {
      label: "Left reset → firmware",
      detail: "左側を bootloader にして reset UF2、再度 bootloader にして Left firmware UF2 を直接コピーします。",
      state: flashLeftState,
    },
    {
      label: "Right reset → firmware",
      detail: "右側へ USB を差し替え、reset UF2、再度 bootloader、Right firmware UF2 の順で直接コピーします。",
      state: flashRightState,
    },
  ];
}

function releaseFlowGroupState(
  readiness: FirmwareReleaseReadiness,
  currentSteps: FirmwareReleaseStep[],
  lastStep: FirmwareReleaseStep,
  doneOverride = false,
): ReleaseGateState {
  if (doneOverride || releaseStepIndex(readiness.step) > releaseStepIndex(lastStep)) return "done";
  if (currentSteps.includes(readiness.step)) return "current";
  return "pending";
}

function releaseFlowSummary(readiness: FirmwareReleaseReadiness): string {
  if (readiness.complete) return "左右の書き込みが完了しています。";
  if (readiness.leftFlashed && readiness.canFlashRight) return "Left は完了済みです。右側で reset UF2 から直接コピーします。";
  if (readiness.rightFlashed && readiness.canFlashLeft) return "Right は完了済みです。左側で reset UF2 から直接コピーします。";
  if (readiness.canFlashLeft && readiness.canFlashRight) return "Artifact 取得済みです。左右どちらからでも reset UF2 から直接コピーできます。";
  if (readiness.canFlashLeft) return "Artifact 取得済みです。左側の reset UF2 から直接コピーします。";
  return "左から順に進めると、最後に左右 UF2 の書き込みまで到達できます。";
}

function classifyBuildStatusTone(message: string, isBusy: boolean): BuildStatusTone {
  const normalized = message.toLowerCase();
  if (isBusy || /しています|中$|待っています/.test(message)) return "busy";
  if (/失敗|エラー|拒否|invalid|not found/.test(normalized)) return "error";
  if (/完了|読み込みました|取得しました|コピーしました|起動しました|記録しました|保存しました|戻しました|消去しました|接続が完了|ok/.test(normalized)) {
    return "success";
  }
  if (/未設定|未確認|未入力|未検出|キャンセル|条件|止めました|まだ|ありません|入力してください|確認してから|設定してください|作成後/.test(message)) {
    return "warning";
  }
  return "neutral";
}

function releaseStepIndex(step: FirmwareReleaseStep): number {
  return [
    "connect-github",
    "select-repository",
    "load-files",
    "edit",
    "review-diff",
    "commit",
    "build",
    "download-artifact",
    "flash-left",
    "flash-right",
    "done",
  ].indexOf(step);
}

function releaseGateState(readiness: FirmwareReleaseReadiness, step: FirmwareReleaseStep, done: boolean): ReleaseGateState {
  if (done) return "done";
  return readiness.step === step ? "current" : "pending";
}

function releaseGateMessage(state: ReleaseGateState, readiness: FirmwareReleaseReadiness): string {
  if (state === "done") return "OK";
  if (state === "current") return readiness.blockers[0] ?? readiness.nextAction;
  return "待機中";
}

function releaseNextActionTitle(readiness: FirmwareReleaseReadiness): string {
  if (readiness.step === "edit") return "キー / Combo / Trackball を編集";
  return readiness.nextAction;
}

function releaseNextActionDescription(readiness: FirmwareReleaseReadiness): string {
  switch (readiness.step) {
    case "connect-github":
      return "GitHub token または OAuth で firmware repository に接続します。";
    case "select-repository":
      return "対象 repository と branch を確認します。";
    case "load-files":
      return "GitHub から keymap / overlay を読み込みます。";
    case "edit":
      return "変更がまだありません。編集後に Diff 確認、Commit & Build へ進めます。";
    case "review-diff":
      return "Diff で変更内容を確認してから commit します。";
    case "commit":
      return "確認済みの変更を firmware repository に commit します。";
    case "build":
      return "GitHub Actions の build run を起動または確認します。";
    case "download-artifact":
      return "成功した build artifact から left / reset / right UF2 を取得します。";
    case "flash-left":
      return "左側を bootloader にして reset UF2、次に left firmware UF2 を直接コピーします。";
    case "flash-right":
      return "右側を bootloader にして reset UF2、次に right firmware UF2 を直接コピーします。";
    case "done":
      return "左右の UF2 書き込みが完了しています。";
  }
}

function BrowserReleaseGateList({ readiness }: { readiness: FirmwareReleaseReadiness }) {
  const currentIndex = releaseStepIndex(readiness.step);
  const gates = [
    { label: "GitHub", step: "connect-github", done: currentIndex > releaseStepIndex("connect-github") },
    { label: "Repository", step: "select-repository", done: currentIndex > releaseStepIndex("select-repository") },
    { label: "Files", step: "load-files", done: currentIndex > releaseStepIndex("load-files") },
    { label: "Diff", step: "review-diff", done: readiness.canCommit || readiness.canBuild || currentIndex > releaseStepIndex("review-diff") },
    { label: "Build", step: "build", done: readiness.canDownloadArtifact || readiness.canFlashLeft || readiness.canFlashRight || readiness.complete },
    { label: "Left", step: "flash-left", done: readiness.leftFlashed || readiness.complete },
    { label: "Right", step: "flash-right", done: readiness.rightFlashed || readiness.complete },
  ] satisfies Array<{ label: string; step: FirmwareReleaseStep; done: boolean }>;

  return (
    <div className="build-check-list" aria-label="Browser firmware release checks">
      {gates.map((gate) => {
        const state = releaseGateState(readiness, gate.step, gate.done);
        const Icon = state === "done" ? CheckCircle2 : state === "current" ? AlertTriangle : Clock;
        return (
        <div className={`build-check-item ${state}`} key={gate.label}>
          <Icon size={13} />
          <span>{gate.label}</span>
          <em>{releaseGateMessage(state, readiness)}</em>
        </div>
      );
      })}
    </div>
  );
}

function BuildWorkbench({
  bootloaderVolumes,
  buildCheck,
  buildStatus,
  flashError,
  flashSide,
  firmwareUf2Targets,
  firmwareRepoLabel,
  firmwareRepoUrl,
  onCheckBuildReady,
  onBack,
  onCopySelectedUf2,
  onDownloadArtifacts,
  onFlashSideChange,
  onFlashWizardCopy,
  onFirmwareRepoUrlChange,
  onRefreshBuildStatus,
  onRefreshFlashTargets,
  onSelectUf2,
  onSelectVolume,
  onSavePushBuild,
  onTriggerBuild,
  selectedUf2,
  selectedVolume,
  uf2Files,
}: {
  bootloaderVolumes: string[];
  buildCheck: FirmwareBuildCheck | null;
  buildStatus: string;
  flashError: string;
  flashSide: FlashSide;
  firmwareUf2Targets: FirmwareUf2Targets;
  firmwareRepoLabel: string;
  firmwareRepoUrl: string;
  onCheckBuildReady: () => void;
  onBack: () => void;
  onCopySelectedUf2: () => void;
  onDownloadArtifacts: () => void;
  onFlashSideChange: (side: FlashSide) => void;
  onFlashWizardCopy: (side: FlashSide) => void;
  onFirmwareRepoUrlChange: (value: string) => void;
  onRefreshBuildStatus: () => void;
  onRefreshFlashTargets: () => void;
  onSelectUf2: (value: string) => void;
  onSelectVolume: (value: string) => void;
  onSavePushBuild: () => void;
  onTriggerBuild: () => void;
  selectedUf2: string;
  selectedVolume: string;
  uf2Files: string[];
}) {
  return (
    <div className="workbench-grid build-workbench">
      <FirmwareFlowStepper current="build" />
      <section className="build-panel">
        <div className="build-panel-heading">
          <div>
            <p className="eyebrow">Build</p>
            <h2>GitHub Actions</h2>
          </div>
          <BackToEditButton onBack={onBack} />
        </div>
        <label className="build-repo-field" htmlFor="tauri-firmware-repository-url">
          <span>Firmware repository URL</span>
          <input
            id="tauri-firmware-repository-url"
            name="tauriFirmwareRepositoryUrl"
            type="url"
            placeholder="https://github.com/<owner>/<repo>"
            value={firmwareRepoUrl}
            onChange={(event) => onFirmwareRepoUrlChange(event.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <small>build workflow を起動する repository ({firmwareRepoLabel})</small>
        </label>
        <ol>
          <li>Diff を確認して保存</li>
          <li>build workflow を起動</li>
          <li>最新 run のステータスを確認</li>
          <li>artifact から左右 UF2 を取得</li>
        </ol>
        <p className="build-status">{buildStatus}</p>
        <div className="build-actions">
          <button type="button" onClick={onCheckBuildReady}>
            <CheckCircle2 size={16} />
            <span className="button-label">接続確認</span>
          </button>
          <button type="button" className="primary" onClick={onSavePushBuild}>
            <UploadCloud size={16} />
            <span className="button-label">保存してBuild</span>
          </button>
          <button type="button" onClick={onTriggerBuild}>
            <UploadCloud size={16} />
            <span className="button-label">Build 起動</span>
          </button>
          <button type="button" onClick={onRefreshBuildStatus}>
            <span className="button-label">最新 run</span>
          </button>
          <button type="button" onClick={onDownloadArtifacts}>
            <span className="button-label">Artifact 取得</span>
          </button>
        </div>
        <BuildCheckList check={buildCheck} />
      </section>
      <section className="flash-panel">
        <div>
          <p className="eyebrow">Flash</p>
          <h2>UF2 → Bootloader</h2>
        </div>
        <FirmwareWriteGuide />
        <div className="flash-wizard">
          <div className="flash-wizard-header">
            <strong>{sideLabel(flashSide)} 側を書き込み</strong>
            <span>{formatUf2Name(firmwareUf2Targets[flashSide])}</span>
          </div>
          <FlashWriteError message={flashError} />
          <div className="flash-side-toggle" role="group" aria-label="Flash side">
            {(["left", "right"] as FlashSide[]).map((side) => (
              <button
                type="button"
                key={side}
                className={flashSide === side ? "active" : ""}
                onClick={() => onFlashSideChange(side)}
              >
                {sideLabel(side)}
              </button>
            ))}
          </div>
          <button type="button" className="wide-action" onClick={onRefreshFlashTargets}>
            UF2 / Volume を更新
          </button>
          <button
            type="button"
            className="primary wide-action"
            disabled={
              !firmwareUf2Targets[flashSide] ||
              bootloaderVolumes.length === 0 ||
              (bootloaderVolumes.length > 1 && !selectedVolume)
            }
            onClick={() => onFlashWizardCopy(flashSide)}
          >
            {sideLabel(flashSide)} UF2 を bootloader にコピー
          </button>
          <small>
            {bootloaderVolumes.length > 0
              ? `検出中: ${bootloaderVolumes.map((volume) => volume.split("/").pop()).join(", ")}`
              : `${sideLabel(flashSide)} 側を bootloader に入れてから更新してください`}
          </small>
        </div>
        <details className="flash-advanced">
          <summary>手動で UF2 / Bootloader を選ぶ</summary>
          <label>
            UF2
            <select name="manualUf2File" value={selectedUf2} onChange={(event) => onSelectUf2(event.target.value)}>
              <option value="">未選択</option>
              {uf2Files.map((file) => (
                <option key={file} value={file}>
                  {file.split("/").pop()}
                </option>
              ))}
            </select>
          </label>
          <label>
            Bootloader
            <select name="manualBootloaderVolume" value={selectedVolume} onChange={(event) => onSelectVolume(event.target.value)}>
              <option value="">未選択</option>
              {bootloaderVolumes.map((volume) => (
                <option key={volume} value={volume}>
                  {volume.split("/").pop()}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="primary wide-action" onClick={onCopySelectedUf2}>
            UF2 を bootloader にコピー
          </button>
        </details>
      </section>
    </div>
  );
}

function BuildCheckList({ check }: { check: FirmwareBuildCheck | null }) {
  if (!check) {
    return null;
  }

  return (
    <div className={`build-check-list ${check.ok ? "ok" : "error"}`} aria-label="Build prerequisite checks">
      {check.items.map((item) => (
        <div className="build-check-item" key={item.label}>
          {item.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
          <span>{item.label}</span>
          <em>{item.detail}</em>
        </div>
      ))}
    </div>
  );
}

function FirmwareWriteGuide() {
  return (
    <div className="flash-guide">
      <strong>左右の書き込み</strong>
      <p>
        Firmware は左右別の UF2 を焼きます。左側を USB で bootloader に入れて left UF2 をコピーし、
        次に右側へ USB を差し替えて right UF2 をコピーします。
      </p>
      <p>
        Direct Mode は UF2 ではなく、USB / Bluetooth で接続中の Studio device に設定を保存します。
        接続していない側の firmware までは書き換えません。
      </p>
    </div>
  );
}

function DiffWorkbench({ diffs }: { diffs: FileDiff[] }) {
  return (
    <section className="diff-panel">
      <div className="panel-heading compact">
        <h3>保存前 diff</h3>
        <span>{diffs.length === 0 ? "変更なし" : `${diffs.length} ファイル`}</span>
      </div>
      {diffs.length === 0 ? (
        <p className="diff-empty">変更はまだありません</p>
      ) : (
        <div className="diff-viewer">
          {diffs.map((diff) => {
            const added = diff.lines.filter((line) => line.startsWith("+")).length;
            const removed = diff.lines.filter((line) => line.startsWith("-")).length;
            return (
              <article className="diff-file" key={diff.filename}>
                <header className="diff-file-header">
                  <span>{diff.filename}</span>
                  <span className="diff-file-counts">
                    <span className="added">+{added}</span>
                    <span className="removed">−{removed}</span>
                  </span>
                </header>
                <ol className="diff-lines">
                  {diff.lines.map((line, index) => {
                    const kind = classifyDiffLine(line);
                    const sign = kind === "add" ? "+" : kind === "del" ? "−" : kind === "elide" ? "…" : " ";
                    const body = kind === "elide" ? "(中略)" : line.slice(1);
                    return (
                      <li key={`${diff.filename}-${index}`} className={kind}>
                        <span className="sign">{sign}</span>
                        <span className="content">{body}</span>
                      </li>
                    );
                  })}
                </ol>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function classifyDiffLine(line: string): "add" | "del" | "elide" | "ctx" {
  if (line === "...") return "elide";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "ctx";
}

function ComboPanel({
  combos,
  onCreate,
  onDelete,
  onSelect,
  selectedComboId,
  selectedCombos,
}: {
  combos: KeymapCombo[];
  onCreate?: () => void;
  onDelete?: (combo: KeymapCombo) => void;
  onSelect?: (comboId: string) => void;
  selectedComboId: string | null;
  selectedCombos: KeymapCombo[];
}) {
  const relatedComboIds = React.useMemo(() => new Set(selectedCombos.map((combo) => combo.id)), [selectedCombos]);
  const selectedCombo = React.useMemo(
    () => combos.find((combo) => combo.id === selectedComboId),
    [combos, selectedComboId],
  );
  const hasActions = Boolean(onCreate || onDelete);

  return (
    <section className="combo-panel">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Combos</p>
          <h2>コンボ一覧</h2>
        </div>
        <span className="section-count">{combos.length}</span>
      </div>
      <div className={`combo-list-toolbar ${hasActions ? "with-actions" : ""}`}>
        <div className="combo-list-summary" aria-label="Combo list summary">
          <span>全 {combos.length}</span>
          <span>選択キー {selectedCombos.length}</span>
          <span>編集中 {selectedCombo ? "1" : "0"}</span>
        </div>
        {hasActions ? (
          <div className="combo-list-actions" aria-label="Combo actions">
            {onCreate ? (
              <button type="button" className="primary" onClick={onCreate}>
                <Plus size={14} />
                <span className="button-label">追加</span>
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="danger"
                onClick={() => selectedCombo && onDelete(selectedCombo)}
                disabled={!selectedCombo}
              >
                <Trash2 size={14} />
                <span className="button-label">削除</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="combo-list">
        {combos.length === 0 ? (
          <p className="empty-note">combo がありません</p>
        ) : (
          combos.map((combo) => (
            <ComboRow
              combo={combo}
              key={combo.id}
              isRelated={relatedComboIds.has(combo.id)}
              isSelected={combo.id === selectedComboId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </section>
  );
}

function ComboRow({
  combo,
  isRelated = false,
  isSelected = false,
  onSelect,
}: {
  combo: KeymapCombo;
  isRelated?: boolean;
  isSelected?: boolean;
  onSelect?: (comboId: string) => void;
}) {
  const tone = bindingTone(combo.binding);

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      className={`combo-row ${tone} ${isRelated ? "related" : ""} ${isSelected ? "selected" : ""}`}
      onClick={() => onSelect?.(combo.id)}
    >
      <span className="combo-row-keys">{combo.keyPositions.map((position) => position + 1).join(" + ")}</span>
	      <BindingChip binding={combo.binding} compact />
	      <span className="combo-row-flags">
	        <span className="combo-row-scope">{formatComboLayerScope(combo)}</span>
	        {isSelected ? <span className="combo-row-state">編集中</span> : null}
	        {isRelated ? <span className="combo-row-state">選択キー</span> : null}
	      </span>
      <em>{combo.timeoutMs}ms</em>
    </button>
  );
}

function ComboEditor({
  combo,
  onPreview,
  onSave,
  onSelect,
  readOnly = false,
  saveLabel = "Combo の編集を保存",
}: {
  combo?: KeymapCombo;
  onPreview?: (combo: KeymapCombo, input: ComboFormValue, options?: { silent?: boolean }) => void;
  onSave: (combo: KeymapCombo, input: ComboFormValue) => void;
  onSelect: (comboId: string) => void;
  readOnly?: boolean;
  saveLabel?: string;
}) {
  const [form, setForm] = React.useState<ComboFormValue>(() => comboToFormValue(combo));
  const onPreviewRef = React.useRef(onPreview);

  React.useEffect(() => {
    onPreviewRef.current = onPreview;
  }, [onPreview]);

  React.useEffect(() => {
    if (!combo) {
      return;
    }

    setForm(comboToFormValue(combo));
  }, [combo]);

  React.useEffect(() => {
    if (!combo || !onPreviewRef.current) {
      return;
    }
    onPreviewRef.current(combo, form, { silent: true });
  }, [combo, form]);

  return (
    <section className="trackball-parameters">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Combo Edit</p>
          <h2>{combo?.id ?? "未選択"}</h2>
        </div>
      </div>
      {combo ? (
        <div className="combo-editor">
          <div className="combo-editor-summary" aria-label="Combo 編集対象">
            <div>
              <span>Keys</span>
              <strong>{combo.keyPositions.map((position) => position + 1).join(" + ")}</strong>
            </div>
	            <div>
	              <span>動作</span>
	              <BindingChip binding={combo.binding} compact />
	            </div>
	            <div>
	              <span>Layers</span>
	              <strong>{formatComboLayerScope(combo)}</strong>
	            </div>
	            <div>
	              <span>Timeout</span>
	              <strong>{combo.timeoutMs}ms</strong>
            </div>
          </div>
          <ComboKeyPicker
            value={form.keyPositions}
            onFocus={() => onSelect(combo.id)}
            onChange={(keyPositions) => setForm((current) => ({ ...current, keyPositions }))}
          />
          <BindingEditor
            actionLabel="Combo 動作を編集"
            applyOnChange
            binding={form.binding}
            currentBinding={combo.binding}
            onApply={(binding) => {
              onSelect(combo.id);
              setForm((current) => ({ ...current, binding }));
            }}
          />
          <div className="binding-review combo-binding-target" aria-label="Combo 動作の変更予定">
            <div className={combo.binding === form.binding ? "" : "changed"}>
              <span>変更後の動作</span>
              <BindingSummary binding={form.binding} />
            </div>
          </div>
          <label>
            Timeout
            <input
              name={`combo-${combo.id}-timeout`}
              min={1}
              type="number"
              value={form.timeoutMs}
              onChange={(event) => setForm((current) => ({ ...current, timeoutMs: Number(event.target.value) }))}
              onFocus={() => onSelect(combo.id)}
            />
          </label>
          <div className="combo-editor-actions">
            <button type="button" className="primary" onClick={() => onSave(combo, form)} disabled={readOnly}>
              {saveLabel}
            </button>
          </div>
        </div>
      ) : (
        <p className="empty-note">編集対象が未選択です</p>
      )}
    </section>
  );
}

function comboToFormValue(combo?: KeymapCombo): ComboFormValue {
  return {
    binding: combo?.binding ?? "",
    keyPositions: combo ? combo.keyPositions.map((position) => position + 1).join(" ") : "",
    timeoutMs: combo?.timeoutMs ?? 50,
  };
}

function ComboKeyPicker({
  disabled = false,
  onChange,
  onFocus,
  value,
}: {
  disabled?: boolean;
  onChange: (value: string) => void;
  onFocus: () => void;
  value: string;
}) {
  const selectedPositions = parseDisplayKeyPositions(value);
  const selectedSet = new Set(selectedPositions);

  return (
    <div className="combo-key-picker">
      <div className="binding-preview">
        <span>Keys</span>
        <strong>{selectedPositions.map((position) => position + 1).join(" + ") || "未選択"}</strong>
      </div>
      <div className="combo-key-grid" onFocus={onFocus}>
        {Array.from({ length: 40 }, (_, index) => (
          <button
            type="button"
            key={index}
            className={selectedSet.has(index) ? "selected" : ""}
            disabled={disabled}
            onClick={() => {
              onFocus();
              onChange(toggleDisplayKeyPosition(selectedPositions, index));
            }}
          >
            <strong>{index + 1}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function BindingEditor({
  actionLabel,
  applyOnChange = false,
  binding,
  currentBinding,
  disabled = false,
  disabledReason,
  onApply,
  onDraftChange,
  showApplyButton = true,
}: {
  actionLabel: string;
  applyOnChange?: boolean;
  binding: string;
  currentBinding?: string;
  disabled?: boolean;
  disabledReason?: string;
  onApply: (binding: string) => void | Promise<void>;
  onDraftChange?: (binding: string) => void;
  showApplyButton?: boolean;
}) {
  const [form, setForm] = React.useState<BindingForm>(() => parseBindingForm(binding));
  const builtBinding = React.useMemo(() => buildBindingFromForm(form), [form]);
  const onApplyRef = React.useRef(onApply);

  React.useEffect(() => {
    onApplyRef.current = onApply;
  }, [onApply]);

  React.useEffect(() => {
    setForm(parseBindingForm(binding));
  }, [binding]);

  React.useEffect(() => {
    onDraftChange?.(builtBinding);
    if (applyOnChange) {
      void onApplyRef.current(builtBinding);
    }
  }, [applyOnChange, builtBinding, onDraftChange]);

  function updateForm(nextForm: BindingForm) {
    setForm(nextForm);
    onDraftChange?.(buildBindingFromForm(nextForm));
  }

  return (
    <div className="binding-editor">
      {currentBinding !== undefined ? (
        <div className="binding-review" aria-label="動作の変更プレビュー">
          <div>
            <span>現在の動作</span>
            <BindingSummary binding={currentBinding} />
          </div>
          <div className={currentBinding === builtBinding ? "" : "changed"}>
            <span>変更後の動作</span>
            <BindingSummary binding={builtBinding} />
          </div>
        </div>
      ) : (
        <div className="binding-preview">
          <span>設定後の動作</span>
          <BindingSummary binding={builtBinding} />
        </div>
      )}

      <ChoiceStrip
        label="動作タイプ"
        choices={BINDING_KIND_OPTIONS}
        selectedValue={form.kind}
        onSelect={(kind) => updateForm(withBindingKindDefaults(form, kind as BindingKind))}
      />

      <BindingValuePicker form={form} onChange={updateForm} />

      <details className="advanced-binding">
        <summary>ZMK 詳細編集</summary>
        <label>
          ZMK 構文
          <input
            name="zmkBinding"
            value={form.raw || builtBinding}
            onChange={(event) => updateForm(parseBindingForm(event.target.value))}
          />
        </label>
      </details>

      {disabledReason ? <p className="empty-note">{disabledReason}</p> : null}
      {showApplyButton && !applyOnChange ? (
        <button type="button" className="primary wide-action" disabled={disabled} onClick={() => onApply(builtBinding)}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function BindingSummary({ binding }: { binding: string }) {
  return (
    <div className="binding-summary">
      <strong>{bindingIntentSummary(binding)}</strong>
      <code>ZMK {formatBindingForDisplay(binding)}</code>
    </div>
  );
}

function bindingIntentSummary(binding: string): string {
  const parts = formatBindingForDisplay(binding).trim().split(/\s+/);
  switch (parts[0]) {
    case "&kp":
      return `Tap ${bindingKeyLabel(parts.slice(1).join(" "))}`;
    case "&lt":
      return `Tap ${bindingKeyLabel(parts.slice(2).join(" "))} / Hold L${parts[1] ?? "?"}`;
    case "&mt":
      return `Tap ${bindingKeyLabel(parts.slice(2).join(" "))} / Hold ${bindingKeyLabel(parts[1] ?? "?")}`;
    case "&mo":
      return `Hold L${parts[1] ?? "?"}`;
    case "&to":
      return `Switch to L${parts[1] ?? "?"}`;
    case "&mkp":
      return `Mouse ${parts[1] ?? "button"}`;
    case "&bt":
      return `Bluetooth ${parts.slice(1).join(" ")}`;
    case "&trans":
      return "Transparent";
    case "&none":
      return "Unassigned";
    default: {
      const display = bindingDisplay(binding);
      return display.badge ? `${display.badge} ${display.label}` : display.label;
    }
  }
}

function bindingKeyLabel(key: string): string {
  return bindingDisplay(`&kp ${key}`).label || key || "?";
}

function BindingValuePicker({
  form,
  onChange,
}: {
  form: BindingForm;
  onChange: (form: BindingForm) => void;
}) {
  switch (form.kind) {
    case "key":
      return (
        <KeyPalette
          label="キー"
          selectedValue={form.primary}
          onSelect={(primary) => onChange({ ...form, primary })}
        />
      );
    case "layer-tap":
      return (
        <>
          <KeyPalette
            label="Tap"
            selectedValue={form.secondary}
            onSelect={(secondary) => onChange({ ...form, secondary })}
          />
          <ChoiceStrip
            label="Hold layer"
            choices={LAYER_CHOICES}
            selectedValue={form.primary}
            onSelect={(primary) => onChange({ ...form, primary })}
          />
        </>
      );
    case "mod-tap":
      return (
        <>
          <KeyPalette
            label="Tap"
            selectedValue={form.secondary}
            onSelect={(secondary) => onChange({ ...form, secondary })}
          />
          <ChoiceStrip
            label="Hold modifier"
            choices={MODIFIER_CHOICES}
            selectedValue={form.primary}
            onSelect={(primary) => onChange({ ...form, primary })}
          />
        </>
      );
    case "momentary":
    case "to-layer":
      return (
        <ChoiceStrip
          label="Layer"
          choices={LAYER_CHOICES}
          selectedValue={form.primary}
          onSelect={(primary) => onChange({ ...form, primary })}
        />
      );
    case "mouse":
      return (
        <ChoiceStrip
          label="Mouse button"
          choices={MOUSE_CHOICES}
          selectedValue={form.primary}
          onSelect={(primary) => onChange({ ...form, primary })}
        />
      );
    case "bluetooth":
      return (
        <>
          <ChoiceStrip
            label="操作"
            choices={BLUETOOTH_ACTION_CHOICES}
            selectedValue={form.primary}
            onSelect={(primary) =>
              onChange({
                ...form,
                primary,
                secondary: primary === "BT_SEL" || primary === "BT_CLR" ? form.secondary || "0" : "",
              })
            }
          />
          {form.primary === "BT_SEL" || form.primary === "BT_CLR" ? (
            <ChoiceStrip
              label="Profile"
              choices={BLUETOOTH_PROFILE_CHOICES}
              selectedValue={form.secondary}
              onSelect={(secondary) => onChange({ ...form, secondary })}
            />
          ) : null}
        </>
      );
    case "raw":
      return (
        <ChoiceStrip
          label="特殊動作"
          choices={SPECIAL_BINDING_CHOICES}
          selectedValue={form.raw}
          onSelect={(raw) => onChange({ ...form, raw })}
        />
      );
  }
}

function KeyPalette({
  label,
  onSelect,
  selectedValue,
}: {
  label: string;
  onSelect: (value: string) => void;
  selectedValue: string;
}) {
  const [groupId, setGroupId] = React.useState(KEY_CHOICE_GROUPS[0]?.id ?? "");
  const activeGroup = KEY_CHOICE_GROUPS.find((group) => group.id === groupId) ?? KEY_CHOICE_GROUPS[0];

  React.useEffect(() => {
    const ownerGroup = KEY_CHOICE_GROUPS.find((group) =>
      group.choices.some((choice) => choice.value === selectedValue),
    );
    if (ownerGroup) {
      setGroupId(ownerGroup.id);
    }
  }, [selectedValue]);

  return (
    <div className="key-palette">
      <ChoiceStrip
        label={label}
        choices={KEY_CHOICE_GROUPS.map((group) => ({ value: group.id, label: group.label }))}
        selectedValue={activeGroup.id}
        onSelect={setGroupId}
      />
      <ChoiceGrid choices={activeGroup.choices} selectedValue={selectedValue} onSelect={onSelect} />
    </div>
  );
}

function ChoiceStrip({
  choices,
  label,
  onSelect,
  selectedValue,
}: {
  choices: KeyChoice[];
  label: string;
  onSelect: (value: string) => void;
  selectedValue: string;
}) {
  return (
    <div className={`choice-strip${label === "動作タイプ" || label.toLowerCase() === "type" ? " binding-type-strip" : ""}`}>
      <span>{label}</span>
      <div>
        {choices.map((choice) => (
          <button
            type="button"
            key={choice.value}
            className={choice.value === selectedValue ? "selected" : ""}
            onClick={() => onSelect(choice.value)}
            title={choice.value}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChoiceGrid({
  choices,
  onSelect,
  selectedValue,
}: {
  choices: KeyChoice[];
  onSelect: (value: string) => void;
  selectedValue: string;
}) {
  return (
    <div className="choice-grid">
      {choices.map((choice) => (
        <button
          type="button"
          key={choice.value}
          className={choice.value === selectedValue ? "selected" : ""}
          onClick={() => onSelect(choice.value)}
          title={choice.value}
        >
          <strong>{choice.label}</strong>
          <span>{choice.value}</span>
        </button>
      ))}
    </div>
  );
}

function withBindingKindDefaults(form: BindingForm, kind: BindingKind): BindingForm {
  if (kind === form.kind) {
    return form;
  }

  switch (kind) {
    case "key":
      return { ...form, kind, primary: form.primary || "A", secondary: "", raw: "" };
    case "layer-tap":
      return { ...form, kind, primary: layerValue(form.primary, "1"), secondary: keyValue(form.secondary, "SPACE"), raw: "" };
    case "mod-tap":
      return { ...form, kind, primary: modifierValue(form.primary, "LCTRL"), secondary: keyValue(form.secondary, "A"), raw: "" };
    case "momentary":
      return { ...form, kind, primary: layerValue(form.primary, "1"), secondary: "", raw: "" };
    case "to-layer":
      return { ...form, kind, primary: layerValue(form.primary, "0"), secondary: "", raw: "" };
    case "mouse":
      return { ...form, kind, primary: mouseValue(form.primary, "MB1"), secondary: "", raw: "" };
    case "bluetooth":
      return { ...form, kind, primary: "BT_SEL", secondary: "0", raw: "" };
    case "raw":
      return { ...form, kind, primary: "", secondary: "", raw: form.raw || "&trans" };
  }
}

function keyValue(value: string, fallback: string): string {
  return KEY_CHOICE_GROUPS.some((group: KeyChoiceGroup) => group.choices.some((choice) => choice.value === value))
    ? value
    : fallback;
}

function layerValue(value: string, fallback: string): string {
  return LAYER_CHOICES.some((choice) => choice.value === value) ? value : fallback;
}

function modifierValue(value: string, fallback: string): string {
  return MODIFIER_CHOICES.some((choice) => choice.value === value) ? value : fallback;
}

function mouseValue(value: string, fallback: string): string {
  return MOUSE_CHOICES.some((choice) => choice.value === value) ? value : fallback;
}

function parseDisplayKeyPositions(value: string): number[] {
  const positions = value
    .split(/[\s,]+/)
    .map((item) => Number(item.trim()))
    .filter((number) => Number.isFinite(number) && number >= 1 && number <= 40)
    .map((number) => number - 1);
  return [...new Set(positions)];
}

function directKeyDraftKey(layerIndex: number, keyIndex: number): string {
  return `${layerIndex}:${keyIndex}`;
}

function formatLayerReferenceSummary(references: LayerReferenceSite[]): string {
  const preview = references.slice(0, 3).map((reference) => {
    if (reference.kind === "combo-binding" || reference.kind === "combo-layers") {
      return `Combo ${reference.comboId}`;
    }
    if (reference.kind === "overlay-temp-layer") {
      return `${reference.overlay} overlay / ${reference.processor}`;
    }

    return `Layer ${reference.layerIndex} / Key ${reference.keyIndex + 1}`;
  });
  const remaining = references.length - preview.length;
  return remaining > 0 ? `${preview.join(", ")} ほか ${remaining} 件` : preview.join(", ");
}

function formatComboLayerScope(combo: KeymapCombo): string {
  const explicitLayers = combo.layers && combo.layers.length > 0 ? combo.layers : comboLayerMaskScope(combo);
  if (!explicitLayers || explicitLayers.length === 0) {
    return "全 layer";
  }
  return uniqueSortedLayerIndexes(explicitLayers).map((layer) => `L${layer}`).join(", ");
}

function comboLayerMaskScope(combo: KeymapCombo): number[] | null {
  const layerMask = "layerMask" in combo && typeof combo.layerMask === "number" ? combo.layerMask >>> 0 : 0xffffffff;
  if (layerMask === 0xffffffff) {
    return null;
  }
  const layers: number[] = [];
  for (let layer = 0; layer < 32; layer += 1) {
    if ((layerMask & (1 << layer)) !== 0) {
      layers.push(layer);
    }
  }
  return layers;
}

function uniqueSortedLayerIndexes(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value >= 0))].sort((left, right) => left - right);
}

function applyDirectKeyDraftsToKeymap(keymap: StudioKeymap, drafts: Record<string, DirectKeyDraft>): StudioKeymap {
  const draftList = Object.values(drafts);
  if (draftList.length === 0) {
    return keymap;
  }

  const layers = keymap.layers.map((layer, layerIndex) => {
    const layerDrafts = draftList.filter((draft) => draft.layerIndex === layerIndex);
    if (layerDrafts.length === 0) {
      return layer;
    }
    const bindings = [...layer.bindings];
    for (const draft of layerDrafts) {
      bindings[draft.keyIndex] = draft.to;
    }
    return { ...layer, bindings };
  });

  return { ...keymap, layers };
}

function applyDirectComboDrafts(combos: DirectCombo[], drafts: Record<string, DirectCombo>): DirectCombo[] {
  if (Object.keys(drafts).length === 0) {
    return combos;
  }
  return combos.map((combo) => drafts[combo.id] ?? combo);
}

function sameDirectComboDraft(left: DirectCombo, right: DirectCombo): boolean {
  return (
    left.binding === right.binding &&
    left.keyPositions.join(" ") === right.keyPositions.join(" ") &&
    left.timeoutMs === right.timeoutMs
  );
}

function toggleDisplayKeyPosition(currentPositions: number[], position: number): string {
  const nextPositions = currentPositions.includes(position)
    ? currentPositions.filter((currentPosition) => currentPosition !== position)
    : [...currentPositions, position];
  return nextPositions
    .sort((left, right) => left - right)
    .map((currentPosition) => currentPosition + 1)
    .join(" ");
}

function defaultComboKeyPositions(selectedKeyIndex: number): number[] {
  return selectedKeyIndex >= 39 ? [38, 39] : [selectedKeyIndex, selectedKeyIndex + 1];
}

function nextComboId(combos: KeymapCombo[]): string {
  const existing = new Set(combos.map((combo) => combo.id));
  let index = combos.length + 1;
  while (existing.has(`combo_custom_${index}`)) {
    index += 1;
  }
  return `combo_custom_${index}`;
}

function validateProjectRoot(projectRoot: string): string | undefined {
  if (!projectRoot.trim()) {
    return "KobitoKey_QWERTY のパスを入力してください";
  }
  if (!projectRoot.includes("KobitoKey_QWERTY")) {
    return "KobitoKey_QWERTY リポジトリのパスを指定してください";
  }
  return undefined;
}

function formatFirmwareRepoLabel(repoUrl: string): string {
  const value = repoUrl
    .trim()
    .replace(/\/$/, "")
    .replace(/\.git$/, "")
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/^git@github\.com:/, "");
  return value || "ローカル git repository";
}

function classifyFirmwareUf2Targets(files: string[]): FirmwareUf2Targets {
  const targets: FirmwareUf2Targets = { unknown: [] };

  for (const file of files) {
    const name = (file.split("/").pop() ?? file).toLowerCase();
    if (isLeftUf2Name(name) && !targets.left) {
      targets.left = file;
    } else if (isRightUf2Name(name) && !targets.right) {
      targets.right = file;
    } else {
      targets.unknown.push(file);
    }
  }

  return targets;
}

function firmwareTargetsFromResolved(targets: FirmwareFlashTargets): FirmwareUf2Targets {
  return {
    left: targets.leftUf2,
    right: targets.rightUf2,
    unknown: targets.unknownUf2,
    manifestPath: targets.manifestPath,
  };
}

function isLeftUf2Name(name: string): boolean {
  return /(^|[_\-.])left([_\-.]|$)/.test(name) || /(^|[_\-.])l([_\-.]|$)/.test(name);
}

function isRightUf2Name(name: string): boolean {
  return /(^|[_\-.])right([_\-.]|$)/.test(name) || /(^|[_\-.])r([_\-.]|$)/.test(name);
}

function sideLabel(side: FlashSide): string {
  return side === "left" ? "Left" : "Right";
}

function browserFirmwareOperationLabel(operation: BrowserFirmwareOperation): string {
  switch (operation) {
    case "oauth":
      return "GitHub 接続";
    case "load":
      return "GitHub 読み込み";
    case "commit-build":
      return "Commit & Build";
    case "build":
      return "Build 起動";
    case "refresh-run":
      return "最新 run 確認";
    case "download-artifact":
      return "Artifact 取得";
    case "import-artifact":
      return "Artifact フォルダ読み込み";
    case "flash":
      return "UF2 書き込み";
    case "idle":
      return "待機";
  }
}

function formatUf2Name(path: string | undefined): string {
  return path?.split("/").pop() ?? "UF2 未検出";
}

function formatRunStatus(output: string): string {
  try {
    const runs = JSON.parse(output) as Array<{
      conclusion?: string;
      createdAt?: string;
      headBranch?: string;
      status?: string;
      url?: string;
    }>;
    const run = runs[0];
    if (!run) {
      return "GitHub Actions run が見つかりません";
    }
    return `${run.status ?? "unknown"} / ${run.conclusion ?? "pending"} / ${run.headBranch ?? "-"} / ${run.createdAt ?? ""}`;
  } catch {
    return output || "GitHub Actions run が見つかりません";
  }
}

function mapGitHubRunStatus(status: string, conclusion: string | null): FirmwareBuildStatus {
  if (status === "queued") return "queued";
  if (status === "in_progress" || status === "waiting" || status === "requested") return "in_progress";
  if (status !== "completed") return "unknown";
  if (conclusion === "success") return "success";
  if (conclusion === "cancelled" || conclusion === "skipped") return "cancelled";
  return "failure";
}

function githubOAuthClientId(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.VITE_GITHUB_OAUTH_CLIENT_ID?.trim() ?? "";
}

function fileDiff(filename: string, before: string, after: string): FileDiff {
  return {
    filename,
    lines: summarizeChangedLines(before, after),
  };
}

function TrackballPanel({ settings }: { settings: TrackballSettings }) {
  const groups = [
    {
      title: "Left",
      rows: [
        ["CPI", settings.leftCpi],
        ["Min factor", settings.pointerMinFactor],
        ["Max factor", settings.pointerMaxFactor],
        ["Speed threshold", settings.pointerSpeedThreshold],
        ["Accel exponent", settings.pointerAccelerationExponent],
      ],
    },
    {
      title: "Right",
      rows: [
        ["CPI", settings.rightCpi],
        ["Min factor", settings.rightPointerMinFactor],
        ["Max factor", settings.rightPointerMaxFactor],
        ["Speed threshold", settings.rightPointerSpeedThreshold],
        ["Accel exponent", settings.rightPointerAccelerationExponent],
      ],
    },
    {
      title: "Common",
      rows: [
        ["Gesture threshold", settings.gestureThreshold],
        ["Tab threshold", settings.tabThreshold],
        ["Desktop threshold", settings.desktopThreshold],
      ],
    },
  ];

  return (
    <section>
      <p className="eyebrow">Trackball</p>
      <h2>主要パラメータ</h2>
      <div className="trackball-setting-groups">
        {groups.map((group) => (
          <div className="trackball-setting-group" key={group.title}>
            <div className="trackball-setting-group-heading">
              <strong>{group.title}</strong>
            </div>
            <div className="settings-list">
              {group.rows.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value ?? "-"}</strong>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TrackballEditor({
  onApply,
  settings,
}: {
  onApply: (settings: EditableTrackballSettings) => void;
  settings: TrackballSettings;
}) {
  const [form, setForm] = React.useState<EditableTrackballSettings>(() => settings);

  React.useEffect(() => {
    setForm(settings);
  }, [settings]);

  const groups: Array<{
    title: string;
    fields: Array<[TrackballSettingKey, string]>;
  }> = [
    {
      title: "Left",
      fields: [
        ["leftCpi", "CPI"],
        ["pointerMinFactor", "Min factor"],
        ["pointerMaxFactor", "Max factor"],
        ["pointerSpeedThreshold", "Speed threshold"],
        ["pointerAccelerationExponent", "Accel exponent"],
      ],
    },
    {
      title: "Right",
      fields: [
        ["rightCpi", "CPI"],
        ["rightPointerMinFactor", "Min factor"],
        ["rightPointerMaxFactor", "Max factor"],
        ["rightPointerSpeedThreshold", "Speed threshold"],
        ["rightPointerAccelerationExponent", "Accel exponent"],
      ],
    },
    {
      title: "Common",
      fields: [
        ["gestureThreshold", "Gesture threshold"],
        ["tabThreshold", "Tab threshold"],
        ["desktopThreshold", "Desktop threshold"],
      ],
    },
  ];
  const editableGroups = groups
    .map((group) => ({
      ...group,
      fields: group.fields.filter(([key]) => form[key] !== undefined),
    }))
    .filter((group) => group.fields.length > 0);
  const hasEditableFields = editableGroups.length > 0;

  return (
    <section>
      <p className="eyebrow">Trackball Edit</p>
      <h2>トラックボール編集</h2>
      <div className="trackball-editor">
        <div className="trackball-editor-groups">
          {editableGroups.map((group) => (
            <fieldset className="trackball-setting-group trackball-editor-group" key={group.title}>
              <legend className="trackball-setting-group-heading">
                <strong>{group.title}</strong>
              </legend>
              <div className="trackball-editor-group-fields">
                {group.fields.map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      name={`trackball-${key}`}
                      min={0}
                      type="number"
                      value={form[key] ?? ""}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          [key]: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        {!hasEditableFields ? <p className="empty-note">編集可能な trackball 項目が overlay にありません。</p> : null}
        <button type="button" className="primary" onClick={() => onApply(form)} disabled={!hasEditableFields}>
          トラックボール編集を保存
        </button>
      </div>
    </section>
  );
}

function downloadText(filename: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

function initialEditorMode(): EditorMode {
  if (typeof window === "undefined") {
    return "direct";
  }
  return new URLSearchParams(window.location.search).get("mode") === "firmware" ? "firmware" : "direct";
}

function initialWorkbenchTab(): WorkbenchTabId {
  if (typeof window === "undefined") {
    return "combos";
  }
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "trackball" || tab === "build" || tab === "diff" ? tab : "combos";
}

function getWebRuntimeDiagnostics(isDesktopRuntime: boolean): {
  bluetooth: boolean;
  secure: boolean;
  serial: boolean;
  url: string;
} {
  if (typeof window === "undefined" || typeof navigator === "undefined" || isDesktopRuntime) {
    return { bluetooth: false, secure: false, serial: false, url: "" };
  }

  return {
    bluetooth: "bluetooth" in navigator,
    secure: window.isSecureContext,
    serial: "serial" in navigator,
    url: window.location.href,
  };
}

async function ensureWritablePermission(handle: FileSystemDirectoryHandle): Promise<void> {
  const h = handle as unknown as {
    queryPermission?: (opts: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (opts: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  };
  if (typeof h.queryPermission === "function") {
    const state = await h.queryPermission({ mode: "readwrite" });
    if (state === "granted") return;
  }
  if (typeof h.requestPermission === "function") {
    const next = await h.requestPermission({ mode: "readwrite" });
    if (next === "granted") return;
  }
  throw new Error("フォルダへの書き込み権限がありません");
}

// Layout of the three managed files inside a KobitoKey_QWERTY project.
// Keymap lives at config/KobitoKey.keymap and the overlay pair lives under
// config/boards/shields/KobitoKey/. Both the FS Access API helpers and the
// <input webkitdirectory> fallback follow this exact tree.
const PROJECT_FILE_PATHS: Record<"keymap" | "leftOverlay" | "rightOverlay", string[]> = {
  keymap: ["config", "KobitoKey.keymap"],
  leftOverlay: ["config", "boards", "shields", "KobitoKey", "KobitoKey_left.overlay"],
  rightOverlay: ["config", "boards", "shields", "KobitoKey", "KobitoKey_right.overlay"],
};

type FileSystemDirectoryHandleWithEntries = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
};

async function resolveSubdirectoryHandle(
  root: FileSystemDirectoryHandle,
  segments: string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create });
  }
  return current;
}

async function readLocalFirmwareArtifactsFromDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<GitHubFirmwareArtifacts> {
  const files = await readUf2FilesFromDirectoryHandle(handle);
  if (files.length === 0) {
    throw new Error(`${handle.name} に UF2 ファイルが見つかりません。GitHub Actions artifact を展開したフォルダを選んでください`);
  }

  return {
    files,
    targets: classifyUf2Artifacts(files.map((file) => file.name)),
  };
}

async function readUf2FilesFromDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<GitHubArtifactUf2[]> {
  const files: GitHubArtifactUf2[] = [];
  await collectUf2FilesFromDirectoryHandle(handle, "", handle.name || "artifact folder", files);
  return files;
}

async function collectUf2FilesFromDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  prefix: string,
  artifactName: string,
  files: GitHubArtifactUf2[],
): Promise<void> {
  const directory = handle as FileSystemDirectoryHandleWithEntries;
  if (typeof directory.entries !== "function") {
    throw new Error("このブラウザでは artifact フォルダ内のファイル一覧を読めません");
  }

  for await (const [name, child] of directory.entries()) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (child.kind === "directory") {
      await collectUf2FilesFromDirectoryHandle(child, relativePath, artifactName, files);
      continue;
    }
    if (!name.toLowerCase().endsWith(".uf2")) {
      continue;
    }
    const file = await child.getFile();
    files.push({
      artifactName: `${artifactName} folder`,
      bytes: new Uint8Array(await file.arrayBuffer()),
      name: relativePath,
    });
  }
}

async function writeProjectToDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  files: ProjectFiles,
): Promise<void> {
  await ensureWritablePermission(handle);
  const targets: Array<[(keyof typeof PROJECT_FILE_PATHS), string]> = [
    ["keymap", files.keymap],
    ["leftOverlay", files.leftOverlay],
    ["rightOverlay", files.rightOverlay],
  ];
  for (const [slot, contents] of targets) {
    const segments = PROJECT_FILE_PATHS[slot];
    const dirSegments = segments.slice(0, -1);
    const filename = segments[segments.length - 1];
    const dir = await resolveSubdirectoryHandle(handle, dirSegments, true);
    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await (fileHandle as unknown as { createWritable: () => Promise<FileSystemWritableFileStream> }).createWritable();
    try {
      await writable.write(contents);
    } finally {
      await writable.close();
    }
  }
}

function downloadBytes(filename: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([arrayBufferFromBytes(bytes)], { type: "application/octet-stream" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function readProjectFromDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<ProjectFiles> {
  const project: ProjectFiles = { keymap: "", leftOverlay: "", rightOverlay: "" };
  const slots = Object.keys(PROJECT_FILE_PATHS) as Array<keyof typeof PROJECT_FILE_PATHS>;
  const missing: string[] = [];
  for (const slot of slots) {
    const segments = PROJECT_FILE_PATHS[slot];
    const dirSegments = segments.slice(0, -1);
    const filename = segments[segments.length - 1];
    try {
      const dir = await resolveSubdirectoryHandle(handle, dirSegments, false);
      const fileHandle = await dir.getFileHandle(filename, { create: false });
      const file = await fileHandle.getFile();
      project[slot] = await file.text();
    } catch {
      missing.push(segments.join("/"));
    }
  }
  if (missing.length > 0) {
    throw new Error(`ファイルが見つかりません: ${missing.join(", ")}`);
  }
  return project;
}

async function readProjectFromFileList(list: FileList): Promise<{ files: ProjectFiles; rootLabel: string }> {
  // Map "config/KobitoKey.keymap" → slot, etc. Matching against the trailing
  // suffix lets us tolerate the optional <root>/ prefix that browsers include
  // in webkitRelativePath.
  const wanted: Array<[string, keyof typeof PROJECT_FILE_PATHS]> = (
    Object.entries(PROJECT_FILE_PATHS) as Array<[keyof typeof PROJECT_FILE_PATHS, string[]]>
  ).map(([slot, segments]) => [segments.join("/"), slot]);

  const files: ProjectFiles = { keymap: "", leftOverlay: "", rightOverlay: "" };
  const found = new Set<keyof typeof PROJECT_FILE_PATHS>();
  let rootLabel = "";
  for (const file of Array.from(list)) {
    const rel = (file as unknown as { webkitRelativePath?: string }).webkitRelativePath ?? file.name;
    const parts = rel.split("/");
    if (parts.length > 1 && !rootLabel) rootLabel = parts[0];
    for (const [suffix, slot] of wanted) {
      if (rel === suffix || rel.endsWith(`/${suffix}`)) {
        files[slot] = await file.text();
        found.add(slot);
        break;
      }
    }
  }
  const missing = (Object.keys(PROJECT_FILE_PATHS) as Array<keyof typeof PROJECT_FILE_PATHS>)
    .filter((slot) => !found.has(slot))
    .map((slot) => PROJECT_FILE_PATHS[slot].join("/"));
  if (missing.length > 0) {
    throw new Error(`ファイルが見つかりません: ${missing.join(", ")}`);
  }
  if (!rootLabel) rootLabel = "(選択フォルダ)";
  return { files, rootLabel };
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
