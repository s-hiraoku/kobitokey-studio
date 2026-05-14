import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Download, FolderOpen, RefreshCw, Save, UploadCloud, Usb } from "lucide-react";
import { BindingForm, BindingKind, buildBindingFromForm, parseBindingForm } from "./lib/bindingForm";
import { bindingDisplay } from "./lib/bindingDisplay";
import { summarizeChangedLines } from "./lib/diff";
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
  addCombo,
  deleteCombo,
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
import {
  connectWebStudioDevice,
  readWebStudioKeymap,
  supportsWebSerial,
  writeWebStudioKey,
} from "./lib/zmkStudioWeb";
import "./styles.css";

type ProjectFiles = {
  keymapPath?: string;
  keymap: string;
  leftOverlayPath?: string;
  leftOverlay: string;
  rightOverlayPath?: string;
  rightOverlay: string;
};

type FileDiff = {
  filename: string;
  lines: string[];
};

type StudioPort = {
  path: string;
  label: string;
  manufacturer?: string;
  product?: string;
  serialNumber?: string;
  portKind: string;
};

type StudioKeymap = {
  deviceName: string;
  serialNumber: string;
  lockState: string;
  hasUnsavedChanges: boolean;
  layers: StudioLayer[];
};

type StudioLayer = {
  id: number;
  name: string;
  bindings: string[];
};

type EditorMode = "firmware" | "direct";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

const DEFAULT_PROJECT_ROOT = "/Volumes/SSD/ghq/github.com/s-hiraoku/KobitoKey_QWERTY";
function App() {
  const [editorMode, setEditorMode] = React.useState<EditorMode>("direct");
  const [projectRoot, setProjectRoot] = React.useState(DEFAULT_PROJECT_ROOT);
  const [files, setFiles] = React.useState<ProjectFiles | null>(null);
  const [studioPorts, setStudioPorts] = React.useState<StudioPort[]>([]);
  const [selectedStudioPort, setSelectedStudioPort] = React.useState("");
  const [directKeymap, setDirectKeymap] = React.useState<StudioKeymap | null>(null);
  const [bindingDraft, setBindingDraft] = React.useState("");
  const [savedKeymap, setSavedKeymap] = React.useState("");
  const [savedLeftOverlay, setSavedLeftOverlay] = React.useState("");
  const [savedRightOverlay, setSavedRightOverlay] = React.useState("");
  const [activeLayerIndex, setActiveLayerIndex] = React.useState(0);
  const [selectedKeyIndex, setSelectedKeyIndex] = React.useState(0);
  const [selectedComboId, setSelectedComboId] = React.useState<string | null>(null);
  const [workbenchTab, setWorkbenchTab] = React.useState<WorkbenchTabId>("combos");
  const [status, setStatus] = React.useState("fixture を読み込み中");
  const [buildStatus, setBuildStatus] = React.useState("GitHub Actions 未確認");
  const [uf2Files, setUf2Files] = React.useState<string[]>([]);
  const [bootloaderVolumes, setBootloaderVolumes] = React.useState<string[]>([]);
  const [selectedUf2, setSelectedUf2] = React.useState("");
  const [selectedVolume, setSelectedVolume] = React.useState("");
  const isDesktopRuntime = isTauriRuntime();
  const canUseWebSerial = supportsWebSerial();

  React.useEffect(() => {
    loadFixture();
  }, []);

  const isDirectMode = editorMode === "direct";
  const activeKeymapSource = React.useMemo(
    () => (isDirectMode && directKeymap ? studioKeymapToKeymapSource(directKeymap) : files?.keymap ?? ""),
    [directKeymap, files?.keymap, isDirectMode],
  );
  const parsedKeymap = React.useMemo(() => parseKeymap(activeKeymapSource), [activeKeymapSource]);
  const layers = parsedKeymap.layers;
  const combos = parsedKeymap.combos;
  const activeLayer = layers[activeLayerIndex] ?? layers[0];
  const selectedBinding = activeLayer?.bindings[selectedKeyIndex] ?? "";
  const showDirectEmptyState = isDirectMode && !directKeymap;
  const selectedCombos = React.useMemo(
    () => combos.filter((combo) => combo.keyPositions.includes(selectedKeyIndex)),
    [combos, selectedKeyIndex],
  );
  const selectedCombo = React.useMemo(
    () => combos.find((combo) => combo.id === selectedComboId) ?? selectedCombos[0] ?? combos[0],
    [combos, selectedComboId, selectedCombos],
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

  React.useEffect(() => {
    setBindingDraft(selectedBinding);
  }, [activeLayerIndex, editorMode, selectedBinding, selectedKeyIndex]);

  async function loadFixture() {
    const [keymap, leftOverlay, rightOverlay] = await Promise.all([
      fetch("/fixtures/KobitoKey.keymap").then((response) => response.text()),
      fetch("/fixtures/KobitoKey_left.overlay").then((response) => response.text()),
      fetch("/fixtures/KobitoKey_right.overlay").then((response) => response.text()),
    ]);
    setFiles({ keymap, leftOverlay, rightOverlay });
    setSavedKeymap(keymap);
    setSavedLeftOverlay(leftOverlay);
    setSavedRightOverlay(rightOverlay);
    setStatus("fixture を表示中");
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
      setStatus("ローカルプロジェクトを読み込みました");
    } catch (error) {
      setStatus(`読み込み失敗: ${String(error)}`);
    }
  }

  async function chooseProjectFolder() {
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
      setStatus(`フォルダ選択は Tauri アプリ内で利用できます: ${String(error)}`);
    }
  }

  async function saveProjectFiles() {
    if (!files?.keymapPath) {
      downloadText("KobitoKey.keymap", files?.keymap ?? "");
      setStatus("ブラウザ表示のため keymap をダウンロードしました");
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
      setStatus(`保存失敗: ${String(error)}`);
    }
  }

  async function applyBinding(nextBinding: string) {
    if (isDirectMode) {
      await writeDirectBinding(nextBinding);
      return;
    }

    if (!files || !activeLayer) {
      return;
    }

    setFiles({
      ...files,
      keymap: updateLayerBinding(files.keymap, activeLayer, selectedKeyIndex, nextBinding),
    });
    setBindingDraft(nextBinding);
  }

  async function detectStudioPorts() {
    const ports = await invoke<StudioPort[]>("list_studio_ports");
    setStudioPorts(ports);
    setSelectedStudioPort((current) => current || ports[0]?.path || "");
    return ports;
  }

  async function refreshStudioPorts() {
    if (!isDesktopRuntime) {
      setStatus("Direct Mode の実機読み書きは Tauri デスクトップアプリで利用してください。");
      return;
    }

    try {
      const ports = await detectStudioPorts();
      setStatus(`Studio device candidates: ${ports.length}`);
    } catch (error) {
      setStatus(`Studio device 検出失敗: ${String(error)}`);
    }
  }

  async function readStudioDevice() {
    if (!isDesktopRuntime) {
      if (!canUseWebSerial) {
        setStatus("このブラウザは Web Serial に対応していません。Direct Mode は Tauri アプリ内で利用してください。");
        return;
      }

      try {
        const session = await connectWebStudioDevice();
        setSelectedStudioPort(session.label);
        setDirectKeymap(session.keymap);
        setActiveLayerIndex(0);
        setSelectedKeyIndex(0);
        setSelectedComboId(null);
        setStatus(`${session.keymap.deviceName || "ZMK device"} から keymap を読み込みました`);
      } catch (error) {
        setStatus(`Web Serial 読み込み失敗: ${String(error)}`);
      }
      return;
    }

    let portPath = selectedStudioPort;
    if (!portPath) {
      try {
        const ports = await detectStudioPorts();
        portPath = ports[0]?.path || "";
      } catch (error) {
        setStatus(`Studio device 検出失敗: ${String(error)}`);
        return;
      }
    }

    if (!portPath) {
      setStatus("Studio device が見つかりません。USB で接続し、ZMK Studio を有効にした firmware を書き込んでください。");
      return;
    }

    try {
      const nextKeymap = await invoke<StudioKeymap>("read_studio_keymap", { portPath });
      setDirectKeymap(nextKeymap);
      setSelectedStudioPort(portPath);
      setEditorMode("direct");
      setActiveLayerIndex(0);
      setSelectedKeyIndex(0);
      setSelectedComboId(null);
      setStatus(`${nextKeymap.deviceName || "ZMK device"} から keymap を読み込みました`);
    } catch (error) {
      setStatus(`Direct 読み込み失敗: ${String(error)}`);
    }
  }

  async function writeDirectBinding(nextBinding: string) {
    if (!isDesktopRuntime) {
      if (!canUseWebSerial) {
        setStatus("このブラウザは Web Serial に対応していません。");
        return;
      }
      if (!directKeymap) {
        setStatus("Web Serial で device を読み込んでから書き込んでください");
        return;
      }
      const directLayer = directKeymap.layers[activeLayerIndex];
      if (!directLayer) {
        setStatus("Direct Mode の layer が選択されていません");
        return;
      }
      try {
        const nextKeymap = await writeWebStudioKey(directLayer.id, selectedKeyIndex, nextBinding);
        setDirectKeymap(nextKeymap);
        setBindingDraft(nextBinding);
        setStatus(`Key ${selectedKeyIndex + 1} を実機へ書き込みました`);
      } catch (error) {
        setStatus(`Web Serial 書き込み失敗: ${String(error)}`);
      }
      return;
    }

    if (!directKeymap || !selectedStudioPort) {
      setStatus("Direct Mode で接続中の device がありません");
      return;
    }

    const directLayer = directKeymap.layers[activeLayerIndex];
    if (!directLayer) {
      setStatus("Direct Mode の layer が選択されていません");
      return;
    }

    try {
      const nextKeymap = await invoke<StudioKeymap>("write_studio_key", {
        portPath: selectedStudioPort,
        layerId: directLayer.id,
        keyPosition: selectedKeyIndex,
        binding: nextBinding,
      });
      setDirectKeymap(nextKeymap);
      setBindingDraft(nextBinding);
      setStatus(`Key ${selectedKeyIndex + 1} を実機へ書き込みました`);
    } catch (error) {
      setStatus(`Direct 書き込み失敗: ${String(error)}`);
    }
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

    setFiles({
      ...files,
      keymap: updateCombo(files.keymap, combo, {
        id: combo.id,
        binding: input.binding,
        keyPositions,
        timeoutMs: input.timeoutMs,
      }),
    });
    setSelectedComboId(combo.id);
    setStatus(`${combo.id} を更新しました`);
  }

  function createCombo() {
    if (!files) {
      return;
    }

    const id = nextComboId(combos);
    const keyPositions = [selectedKeyIndex, Math.min(selectedKeyIndex + 1, 39)];
    setFiles({
      ...files,
      keymap: addCombo(files.keymap, {
        id,
        binding: "&kp ESC",
        keyPositions,
        timeoutMs: 50,
      }),
    });
    setSelectedComboId(id);
    setStatus(`${id} を追加しました`);
  }

  function removeCombo(combo: KeymapCombo) {
    if (!files) {
      return;
    }

    setFiles({
      ...files,
      keymap: deleteCombo(files.keymap, combo),
    });
    setSelectedComboId(null);
    setStatus(`${combo.id} を削除しました`);
  }

  function applyTrackballSettings(nextSettings: RequiredTrackballSettings) {
    if (!files) {
      return;
    }

    let leftOverlay = files.leftOverlay;
    let rightOverlay = files.rightOverlay;

    leftOverlay = updateBlockNumberSetting(leftOverlay, "tb_left", "cpi", nextSettings.leftCpi);
    rightOverlay = updateBlockNumberSetting(rightOverlay, "tb_right", "cpi", nextSettings.rightCpi);
    leftOverlay = updateBlockNumberSetting(leftOverlay, "pointer_accel", "min-factor", nextSettings.pointerMinFactor);
    leftOverlay = updateBlockNumberSetting(leftOverlay, "pointer_accel", "max-factor", nextSettings.pointerMaxFactor);
    leftOverlay = updateBlockNumberSetting(
      leftOverlay,
      "pointer_accel",
      "speed-threshold",
      nextSettings.pointerSpeedThreshold,
    );
    leftOverlay = updateBlockNumberSetting(
      leftOverlay,
      "pointer_accel",
      "acceleration-exponent",
      nextSettings.pointerAccelerationExponent,
    );
    leftOverlay = updateBlockNumberSetting(
      leftOverlay,
      "pointer_accel_right",
      "min-factor",
      nextSettings.rightPointerMinFactor,
    );
    leftOverlay = updateBlockNumberSetting(
      leftOverlay,
      "pointer_accel_right",
      "max-factor",
      nextSettings.rightPointerMaxFactor,
    );
    leftOverlay = updateBlockNumberSetting(
      leftOverlay,
      "pointer_accel_right",
      "speed-threshold",
      nextSettings.rightPointerSpeedThreshold,
    );
    leftOverlay = updateBlockNumberSetting(
      leftOverlay,
      "pointer_accel_right",
      "acceleration-exponent",
      nextSettings.rightPointerAccelerationExponent,
    );
    leftOverlay = updateBlockNumberSetting(leftOverlay, "gesture_keybind", "threshold", nextSettings.gestureThreshold);
    leftOverlay = updateBlockNumberSetting(leftOverlay, "tab_keybind", "threshold", nextSettings.tabThreshold);
    leftOverlay = updateBlockNumberSetting(leftOverlay, "desktop_keybind", "threshold", nextSettings.desktopThreshold);

    setFiles({ ...files, leftOverlay, rightOverlay });
    setStatus("トラックボール設定を更新しました");
  }

  async function triggerBuild() {
    try {
      await invoke<string>("trigger_github_build", { root: projectRoot });
      setBuildStatus("build workflow を起動しました");
    } catch (error) {
      setBuildStatus(`起動失敗: ${String(error)}`);
    }
  }

  async function refreshBuildStatus() {
    try {
      const output = await invoke<string>("latest_github_run", { root: projectRoot });
      setBuildStatus(formatRunStatus(output));
    } catch (error) {
      setBuildStatus(`確認失敗: ${String(error)}`);
    }
  }

  async function downloadArtifacts() {
    try {
      const output = await invoke<string>("download_latest_artifact", { root: projectRoot });
      setBuildStatus(output || "artifact を .kobitokey-studio/artifacts に保存しました");
    } catch (error) {
      setBuildStatus(`artifact 取得失敗: ${String(error)}`);
    }
  }

  async function refreshFlashTargets() {
    try {
      const [nextUf2Files, nextVolumes] = await Promise.all([
        invoke<string[]>("list_uf2_files", { root: projectRoot }),
        invoke<string[]>("list_bootloader_volumes"),
      ]);
      setUf2Files(nextUf2Files);
      setBootloaderVolumes(nextVolumes);
      setSelectedUf2(nextUf2Files[0] ?? "");
      setSelectedVolume(nextVolumes[0] ?? "");
      setBuildStatus(`UF2 ${nextUf2Files.length} 件 / bootloader ${nextVolumes.length} 件`);
    } catch (error) {
      setBuildStatus(`UF2/volume 確認失敗: ${String(error)}`);
    }
  }

  async function copySelectedUf2() {
    if (!selectedUf2 || !selectedVolume) {
      setBuildStatus("UF2 と bootloader volume を選択してください");
      return;
    }

    const fileName = selectedUf2.split("/").pop() ?? selectedUf2;
    const volumeName = selectedVolume.split("/").pop() ?? selectedVolume;
    const confirmed = window.confirm(`${fileName} を ${volumeName} にコピーします。左右を確認してください。`);
    if (!confirmed) {
      return;
    }

    try {
      const destination = await invoke<string>("copy_uf2_to_volume", {
        uf2Path: selectedUf2,
        volumePath: selectedVolume,
      });
      setBuildStatus(`書き込みコピー完了: ${destination}`);
    } catch (error) {
      setBuildStatus(`UF2 コピー失敗: ${String(error)}`);
    }
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
              onClick={() => setEditorMode("firmware")}
            >
              Firmware
            </button>
            <button
              type="button"
              className={editorMode === "direct" ? "active" : ""}
              onClick={() => setEditorMode("direct")}
            >
              Direct
            </button>
          </div>
          {editorMode === "firmware" ? (
            <div className="project-loader">
              <input
                aria-label="KobitoKey_QWERTY path"
                value={projectRoot}
                onChange={(event) => setProjectRoot(event.target.value)}
              />
              <button type="button" onClick={chooseProjectFolder}>
                <FolderOpen size={17} />
                選択
              </button>
              <button type="button" onClick={loadProject}>
                <FolderOpen size={17} />
                読み込み
              </button>
            </div>
          ) : directKeymap ? (
            <div className="studio-loader">
              <select value={selectedStudioPort} onChange={(event) => setSelectedStudioPort(event.target.value)}>
                <option value="">Studio device 未選択</option>
                {studioPorts.map((port) => (
                  <option key={port.path} value={port.path}>
                    {port.label} ({port.path})
                  </option>
                ))}
              </select>
              <button type="button" onClick={refreshStudioPorts}>
                <RefreshCw size={17} />
                検出
              </button>
              <button type="button" onClick={readStudioDevice}>
                <Usb size={17} />
                読み込み
              </button>
            </div>
          ) : (
            <div className="topbar-hint">
              <Usb size={16} />
              <span>
                {canUseWebSerial
                  ? "中央カードから device を読み込み"
                  : "実機操作は Tauri アプリで利用"}
              </span>
            </div>
          )}
        </div>
      </header>

      {showDirectEmptyState ? (
        <DirectWelcome
          canUseWebSerial={canUseWebSerial}
          isDesktopRuntime={isDesktopRuntime}
          ports={studioPorts}
          selectedPort={selectedStudioPort}
          onPortChange={setSelectedStudioPort}
          onRefresh={refreshStudioPorts}
          onRead={readStudioDevice}
        />
      ) : (
      <section className={`workspace ${isDirectMode ? "direct-workspace" : ""}`}>
        <nav className="sidebar" aria-label="Layers">
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
        </nav>

        <section className="keyboard-panel">
          {isDirectMode ? <DirectConnectionBar keymap={directKeymap} portPath={selectedStudioPort} /> : null}
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Layer {activeLayerIndex}</p>
              <h2>{activeLayer?.label ?? "No layer"}</h2>
            </div>
            {isDirectMode ? (
              <button type="button" className="primary" onClick={readStudioDevice}>
                <RefreshCw size={17} />
                再読み込み
              </button>
            ) : (
              <button type="button" className="primary" onClick={saveProjectFiles}>
                {files?.keymapPath ? <Save size={17} /> : <Download size={17} />}
                {files?.keymapPath ? "保存" : "書き出し"}
              </button>
            )}
          </div>

          <KeyboardGrid
            combos={combos}
            layer={activeLayer}
            selectedComboId={selectedComboId}
            selectedKeyIndex={selectedKeyIndex}
            onComboSelect={setSelectedComboId}
            onSelect={setSelectedKeyIndex}
          />

          {isDirectMode ? (
            <DirectSummaryPanel keymap={directKeymap} portPath={selectedStudioPort} />
          ) : (
            <WorkbenchTabs
              activeTab={workbenchTab}
              onTabChange={setWorkbenchTab}
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
              {workbenchTab === "build" ? (
                <BuildWorkbench
                  buildStatus={buildStatus}
                  uf2Files={uf2Files}
                  bootloaderVolumes={bootloaderVolumes}
                  selectedUf2={selectedUf2}
                  selectedVolume={selectedVolume}
                  onSelectUf2={setSelectedUf2}
                  onSelectVolume={setSelectedVolume}
                  onTriggerBuild={triggerBuild}
                  onRefreshBuildStatus={refreshBuildStatus}
                  onDownloadArtifacts={downloadArtifacts}
                  onRefreshFlashTargets={refreshFlashTargets}
                  onCopySelectedUf2={copySelectedUf2}
                />
              ) : null}
              {workbenchTab === "diff" ? <DiffWorkbench diffs={keymapDiff} /> : null}
            </WorkbenchTabs>
          )}
        </section>

        <aside className="inspector">
          <section className={isDirectMode ? "direct-key-editor" : "key-editor"}>
            <p className="eyebrow">Key {selectedKeyIndex + 1}</p>
            <h2>{selectedBinding}</h2>
            <BindingEditor
              actionLabel={isDirectMode ? "実機へ書き込み" : "Binding に反映"}
              binding={bindingDraft}
              onApply={applyBinding}
            />
          </section>

          {isDirectMode ? (
            <DirectModeNote onFirmwareMode={() => setEditorMode("firmware")} />
          ) : null}
        </aside>
      </section>
      )}

      <footer className="statusbar">{status}</footer>
    </main>
  );
}

type ComboFormValue = {
  binding: string;
  keyPositions: string;
  timeoutMs: number;
};

type RequiredTrackballSettings = Required<Pick<
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
>>;

const BINDING_KIND_OPTIONS: Array<{ value: BindingKind; label: string }> = [
  { value: "key", label: "Key" },
  { value: "layer-tap", label: "Layer Tap" },
  { value: "mod-tap", label: "Mod Tap" },
  { value: "momentary", label: "Momentary" },
  { value: "to-layer", label: "To Layer" },
  { value: "mouse", label: "Mouse" },
  { value: "bluetooth", label: "Bluetooth" },
  { value: "raw", label: "Raw" },
];

function KeyboardGrid({
  combos,
  layer,
  selectedComboId,
  selectedKeyIndex,
  onComboSelect,
  onSelect,
}: {
  combos: KeymapCombo[];
  layer?: KeymapLayer;
  selectedComboId: string | null;
  selectedKeyIndex: number;
  onComboSelect: (comboId: string) => void;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="keyboard-viewport">
      <div
        className="keyboard-layout"
        style={
          {
            "--layout-width": `${LAYOUT_WIDTH}px`,
            "--layout-height": `${LAYOUT_HEIGHT}px`,
          } as React.CSSProperties
        }
      >
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
  );
}

function PhysicalKeyButton({
  binding,
  height,
  index,
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

  return (
    <button
      type="button"
      key={`${side}-${index}`}
      className={`physical-key ${side} ${kind} ${isSelected ? "selected" : ""}`}
      style={{
        left,
        top,
        width,
        height,
        transform: `rotate(${rotation}deg)`,
      }}
      title={binding}
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
            <g className="combo-label" role="button" tabIndex={0} onClick={() => onSelect(combo.id)}>
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

function DirectSummaryPanel({ keymap, portPath }: { keymap: StudioKeymap | null; portPath: string }) {
  return (
    <section className="direct-summary">
      <div className="panel-heading compact">
        <h3>Direct Mode</h3>
        <span>{keymap ? `${keymap.layers.length} layers` : "未接続"}</span>
      </div>
      {keymap ? (
        <dl>
          <div>
            <dt>Device</dt>
            <dd>{keymap.deviceName || "Unknown ZMK device"}</dd>
          </div>
          <div>
            <dt>Port</dt>
            <dd>{portPath || "-"}</dd>
          </div>
          <div>
            <dt>Lock</dt>
            <dd>{keymap.lockState}</dd>
          </div>
          <div>
            <dt>Unsaved</dt>
            <dd>{keymap.hasUnsavedChanges ? "あり" : "なし"}</dd>
          </div>
        </dl>
      ) : (
        <p>上部の Direct で device を検出して読み込むと、実機の keymap がここに表示されます。</p>
      )}
    </section>
  );
}

function DirectConnectionBar({ keymap, portPath }: { keymap: StudioKeymap | null; portPath: string }) {
  return (
    <div className="direct-connection-bar">
      <div>
        <p className="eyebrow">Connected Keyboard</p>
        <strong>{keymap?.deviceName || "ZMK Studio device"}</strong>
      </div>
      <span>{portPath || "port 未選択"}</span>
      <span>{keymap ? `${keymap.layers.length} layers` : "未読み込み"}</span>
      <span>{keymap?.lockState ?? "unknown"}</span>
    </div>
  );
}

function DirectWelcome({
  canUseWebSerial,
  isDesktopRuntime,
  onPortChange,
  onRead,
  onRefresh,
  ports,
  selectedPort,
}: {
  canUseWebSerial: boolean;
  isDesktopRuntime: boolean;
  onPortChange: (port: string) => void;
  onRead: () => void;
  onRefresh: () => void;
  ports: StudioPort[];
  selectedPort: string;
}) {
  return (
    <section className="direct-welcome">
      <div className="direct-welcome-card">
        <div>
          <p className="eyebrow">Direct Mode</p>
          <h2>キーボードを接続</h2>
          <p>
            USB で KobitoKey を接続して、実機の keymap を読み込みます。読み込んだ後は、キーを選んでその場で
            binding を書き込めます。
          </p>
        </div>
        <div className="direct-connect-controls">
          {!isDesktopRuntime && !canUseWebSerial ? (
            <div className="runtime-warning">
              <strong>このブラウザでは device 検出できません</strong>
              <span>Direct Mode の実機読み書きは Tauri デスクトップアプリで利用してください。</span>
            </div>
          ) : null}
          {!isDesktopRuntime && canUseWebSerial ? (
            <div className="runtime-notice">
              <strong>Web Serial で接続します</strong>
              <span>読み込みを押すと、ブラウザの device 選択ダイアログが開きます。</span>
            </div>
          ) : null}
          <label>
            Device
            <select value={selectedPort} onChange={(event) => onPortChange(event.target.value)}>
              <option value="">Studio device 未選択</option>
              {ports.map((port) => (
                <option key={port.path} value={port.path}>
                  {port.label} ({port.path})
                </option>
              ))}
            </select>
          </label>
          <div className="direct-connect-actions">
            <button type="button" disabled={!isDesktopRuntime} onClick={onRefresh}>
              <RefreshCw size={17} />
              検出
            </button>
            <button type="button" className="primary" disabled={!isDesktopRuntime && !canUseWebSerial} onClick={onRead}>
              <Usb size={17} />
              読み込み
            </button>
          </div>
        </div>
        <div className="direct-capability-strip">
          <span>Keymap: 直接編集</span>
          <span>Combo: Firmware Mode</span>
          <span>Trackball: Firmware Mode</span>
        </div>
      </div>
    </section>
  );
}

function DirectModeNote({ onFirmwareMode }: { onFirmwareMode: () => void }) {
  return (
    <section className="direct-note">
      <p className="eyebrow">Direct Mode</p>
      <h2>実機 keymap 書き込み</h2>
      <p>
        キー binding は USB 接続した ZMK Studio 対応 device に直接保存されます。combo とトラックボール設定は
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
  { id: "build", label: "Build & Flash" },
  { id: "diff", label: "Diff" },
];

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
      <ComboPanel combos={combos} selectedCombos={selectedCombos} onSelect={onSelect} />
      <ComboEditor
        combo={selectedCombo}
        onCreate={onCreate}
        onDelete={onDelete}
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
  onApply: (settings: RequiredTrackballSettings) => void;
  settings: TrackballSettings;
}) {
  return (
    <div className="workbench-grid trackball-workbench">
      <TrackballPanel settings={settings} />
      <TrackballEditor settings={settings} onApply={onApply} />
    </div>
  );
}

function BuildWorkbench({
  bootloaderVolumes,
  buildStatus,
  onCopySelectedUf2,
  onDownloadArtifacts,
  onRefreshBuildStatus,
  onRefreshFlashTargets,
  onSelectUf2,
  onSelectVolume,
  onTriggerBuild,
  selectedUf2,
  selectedVolume,
  uf2Files,
}: {
  bootloaderVolumes: string[];
  buildStatus: string;
  onCopySelectedUf2: () => void;
  onDownloadArtifacts: () => void;
  onRefreshBuildStatus: () => void;
  onRefreshFlashTargets: () => void;
  onSelectUf2: (value: string) => void;
  onSelectVolume: (value: string) => void;
  onTriggerBuild: () => void;
  selectedUf2: string;
  selectedVolume: string;
  uf2Files: string[];
}) {
  return (
    <div className="workbench-grid build-workbench">
      <section className="build-panel">
        <div>
          <p className="eyebrow">Build</p>
          <h2>GitHub Actions</h2>
        </div>
        <ol>
          <li>Diff を確認して保存</li>
          <li>build workflow を起動</li>
          <li>最新 run のステータスを確認</li>
          <li>artifact から左右 UF2 を取得</li>
        </ol>
        <p className="build-status">{buildStatus}</p>
        <div className="build-actions">
          <button type="button" className="primary" onClick={onTriggerBuild}>
            <UploadCloud size={16} />
            Build 起動
          </button>
          <button type="button" onClick={onRefreshBuildStatus}>
            最新 run
          </button>
          <button type="button" onClick={onDownloadArtifacts}>
            Artifact 取得
          </button>
        </div>
      </section>
      <section className="flash-panel">
        <div>
          <p className="eyebrow">Flash</p>
          <h2>UF2 → Bootloader</h2>
        </div>
        <button type="button" className="wide-action" onClick={onRefreshFlashTargets}>
          UF2 / Volume を更新
        </button>
        <label>
          UF2
          <select value={selectedUf2} onChange={(event) => onSelectUf2(event.target.value)}>
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
          <select value={selectedVolume} onChange={(event) => onSelectVolume(event.target.value)}>
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
      </section>
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
  onSelect,
  selectedCombos,
}: {
  combos: KeymapCombo[];
  onSelect?: (comboId: string) => void;
  selectedCombos: KeymapCombo[];
}) {
  return (
    <section>
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Combos</p>
          <h2>コンボ一覧</h2>
        </div>
        <span className="section-count">{combos.length}</span>
      </div>
      <div className="combo-focus-list">
        {selectedCombos.length === 0 ? (
          <p className="empty-note">選択キーの combo はありません</p>
        ) : (
          selectedCombos.map((combo) => (
            <ComboRow combo={combo} key={combo.id} isFocused onSelect={onSelect} />
          ))
        )}
      </div>
      <div className="combo-list">
        {combos.map((combo) => (
          <ComboRow combo={combo} key={combo.id} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

function ComboRow({
  combo,
  isFocused = false,
  onSelect,
}: {
  combo: KeymapCombo;
  isFocused?: boolean;
  onSelect?: (comboId: string) => void;
}) {
  const display = bindingDisplay(combo.binding);

  return (
    <button
      type="button"
      className={`combo-row ${isFocused ? "focused" : ""}`}
      onClick={() => onSelect?.(combo.id)}
    >
      <span>{combo.keyPositions.map((position) => position + 1).join(" + ")}</span>
      <strong>
        {display.badge ? `${display.badge} ` : ""}
        {display.label}
      </strong>
      <em>{combo.timeoutMs}ms</em>
    </button>
  );
}

function ComboEditor({
  combo,
  onCreate,
  onDelete,
  onSave,
  onSelect,
}: {
  combo?: KeymapCombo;
  onCreate: () => void;
  onDelete: (combo: KeymapCombo) => void;
  onSave: (combo: KeymapCombo, input: ComboFormValue) => void;
  onSelect: (comboId: string) => void;
}) {
  const [form, setForm] = React.useState<ComboFormValue>({
    binding: "",
    keyPositions: "",
    timeoutMs: 50,
  });

  React.useEffect(() => {
    if (!combo) {
      return;
    }

    setForm({
      binding: combo.binding,
      keyPositions: combo.keyPositions.map((position) => position + 1).join(" "),
      timeoutMs: combo.timeoutMs,
    });
  }, [combo]);

  return (
    <section>
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Combo Edit</p>
          <h2>{combo?.id ?? "新規 combo"}</h2>
        </div>
        <button type="button" className="primary" onClick={onCreate}>
          追加
        </button>
      </div>
      {combo ? (
        <div className="combo-editor">
          <ComboKeyPicker
            value={form.keyPositions}
            onFocus={() => onSelect(combo.id)}
            onChange={(keyPositions) => setForm({ ...form, keyPositions })}
          />
          <BindingEditor
            actionLabel="Combo binding に反映"
            binding={form.binding}
            onApply={(binding) => {
              onSelect(combo.id);
              setForm({ ...form, binding });
            }}
          />
          <label>
            Timeout
            <input
              min={1}
              type="number"
              value={form.timeoutMs}
              onChange={(event) => setForm({ ...form, timeoutMs: Number(event.target.value) })}
              onFocus={() => onSelect(combo.id)}
            />
          </label>
          <div className="combo-editor-actions">
            <button type="button" className="primary" onClick={() => onSave(combo, form)}>
              更新
            </button>
            <button type="button" className="danger" onClick={() => onDelete(combo)}>
              削除
            </button>
          </div>
        </div>
      ) : (
        <p className="empty-note">combo がありません</p>
      )}
    </section>
  );
}

function ComboKeyPicker({
  onChange,
  onFocus,
  value,
}: {
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
  binding,
  onApply,
}: {
  actionLabel: string;
  binding: string;
  onApply: (binding: string) => void;
}) {
  const [form, setForm] = React.useState<BindingForm>(() => parseBindingForm(binding));
  const builtBinding = React.useMemo(() => buildBindingFromForm(form), [form]);

  React.useEffect(() => {
    setForm(parseBindingForm(binding));
  }, [binding]);

  return (
    <div className="binding-editor">
      <div className="binding-preview">
        <span>Preview</span>
        <strong>{builtBinding}</strong>
      </div>

      <ChoiceStrip
        label="Type"
        choices={BINDING_KIND_OPTIONS}
        selectedValue={form.kind}
        onSelect={(kind) => setForm(withBindingKindDefaults(form, kind as BindingKind))}
      />

      <BindingValuePicker form={form} onChange={setForm} />

      <details className="advanced-binding">
        <summary>詳細編集</summary>
        <label>
          Binding
          <input value={form.raw || builtBinding} onChange={(event) => setForm(parseBindingForm(event.target.value))} />
        </label>
      </details>

      <button type="button" className="primary wide-action" onClick={() => onApply(builtBinding)}>
        {actionLabel}
      </button>
    </div>
  );
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
          label="Key"
          selectedValue={form.primary}
          onSelect={(primary) => onChange({ ...form, primary })}
        />
      );
    case "layer-tap":
      return (
        <>
          <ChoiceStrip
            label="Layer"
            choices={LAYER_CHOICES}
            selectedValue={form.primary}
            onSelect={(primary) => onChange({ ...form, primary })}
          />
          <KeyPalette
            label="Tap key"
            selectedValue={form.secondary}
            onSelect={(secondary) => onChange({ ...form, secondary })}
          />
        </>
      );
    case "mod-tap":
      return (
        <>
          <ChoiceStrip
            label="Hold modifier"
            choices={MODIFIER_CHOICES}
            selectedValue={form.primary}
            onSelect={(primary) => onChange({ ...form, primary })}
          />
          <KeyPalette
            label="Tap key"
            selectedValue={form.secondary}
            onSelect={(secondary) => onChange({ ...form, secondary })}
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
            label="Action"
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
          label="Special"
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
    <div className="choice-strip">
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
  return value
    .split(/[\s,]+/)
    .map((item) => Number(item.trim()))
    .filter((number) => Number.isFinite(number) && number >= 1 && number <= 40)
    .map((number) => number - 1);
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

function fileDiff(filename: string, before: string, after: string): FileDiff {
  return {
    filename,
    lines: summarizeChangedLines(before, after),
  };
}

function TrackballPanel({ settings }: { settings: TrackballSettings }) {
  const rows = [
    ["Left CPI", settings.leftCpi],
    ["Right CPI", settings.rightCpi],
    ["Left min factor", settings.pointerMinFactor],
    ["Left max factor", settings.pointerMaxFactor],
    ["Left speed threshold", settings.pointerSpeedThreshold],
    ["Left accel exponent", settings.pointerAccelerationExponent],
    ["Right min factor", settings.rightPointerMinFactor],
    ["Right max factor", settings.rightPointerMaxFactor],
    ["Right speed threshold", settings.rightPointerSpeedThreshold],
    ["Right accel exponent", settings.rightPointerAccelerationExponent],
    ["Gesture threshold", settings.gestureThreshold],
    ["Tab threshold", settings.tabThreshold],
    ["Desktop threshold", settings.desktopThreshold],
  ];

  return (
    <section>
      <p className="eyebrow">Trackball</p>
      <h2>主要パラメータ</h2>
      <div className="settings-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value ?? "-"}</strong>
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
  onApply: (settings: RequiredTrackballSettings) => void;
  settings: TrackballSettings;
}) {
  const [form, setForm] = React.useState<RequiredTrackballSettings>(() => completeTrackballSettings(settings));

  React.useEffect(() => {
    setForm(completeTrackballSettings(settings));
  }, [settings]);

  const fields: Array<[keyof RequiredTrackballSettings, string]> = [
    ["leftCpi", "Left CPI"],
    ["rightCpi", "Right CPI"],
    ["pointerMinFactor", "Left min factor"],
    ["pointerMaxFactor", "Left max factor"],
    ["pointerSpeedThreshold", "Left speed threshold"],
    ["pointerAccelerationExponent", "Left exponent"],
    ["rightPointerMinFactor", "Right min factor"],
    ["rightPointerMaxFactor", "Right max factor"],
    ["rightPointerSpeedThreshold", "Right speed threshold"],
    ["rightPointerAccelerationExponent", "Right exponent"],
    ["gestureThreshold", "Gesture threshold"],
    ["tabThreshold", "Tab threshold"],
    ["desktopThreshold", "Desktop threshold"],
  ];

  return (
    <section>
      <p className="eyebrow">Trackball Edit</p>
      <h2>トラックボール編集</h2>
      <div className="trackball-editor">
        {fields.map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              min={0}
              type="number"
              value={form[key]}
              onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })}
            />
          </label>
        ))}
        <button type="button" className="primary" onClick={() => onApply(form)}>
          設定に反映
        </button>
      </div>
    </section>
  );
}

function completeTrackballSettings(settings: TrackballSettings): RequiredTrackballSettings {
  return {
    leftCpi: settings.leftCpi ?? 200,
    rightCpi: settings.rightCpi ?? 700,
    pointerMinFactor: settings.pointerMinFactor ?? 800,
    pointerMaxFactor: settings.pointerMaxFactor ?? 2500,
    pointerSpeedThreshold: settings.pointerSpeedThreshold ?? 1400,
    pointerAccelerationExponent: settings.pointerAccelerationExponent ?? 3,
    rightPointerMinFactor: settings.rightPointerMinFactor ?? 620,
    rightPointerMaxFactor: settings.rightPointerMaxFactor ?? 2200,
    rightPointerSpeedThreshold: settings.rightPointerSpeedThreshold ?? 2500,
    rightPointerAccelerationExponent: settings.rightPointerAccelerationExponent ?? 3,
    gestureThreshold: settings.gestureThreshold ?? 4,
    tabThreshold: settings.tabThreshold ?? 4,
    desktopThreshold: settings.desktopThreshold ?? 8,
  };
}

function downloadText(filename: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function studioKeymapToKeymapSource(keymap: StudioKeymap): string {
  const layers = keymap.layers
    .map((layer, index) => {
      const id = sanitizeLayerId(layer.name || `layer_${index}`, index);
      return [
        `        ${id} {`,
        `            display-name = "${escapeDtsString(layer.name || `Layer ${index}`)}";`,
        "            bindings = <",
        formatStudioBindings(layer.bindings),
        "            >;",
        "        };",
      ].join("\n");
    })
    .join("\n\n");

  return ["/ {", "    keymap {", "        compatible = \"zmk,keymap\";", layers, "    };", "};"].join("\n");
}

function formatStudioBindings(bindings: string[]): string {
  const completeBindings = Array.from({ length: 40 }, (_, index) => bindings[index] ?? "&none");
  const maxLength = Math.max(...completeBindings.map((binding) => binding.length), 7);

  return Array.from({ length: 4 }, (_, row) =>
    completeBindings
      .slice(row * 10, row * 10 + 10)
      .map((binding) => binding.padEnd(maxLength, " "))
      .join("  ")
      .trimEnd(),
  ).join("\n");
}

function sanitizeLayerId(name: string, index: number): string {
  const id = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return id || `layer_${index}`;
}

function escapeDtsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
