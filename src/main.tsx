import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { Download, FolderOpen, Save, UploadCloud } from "lucide-react";
import { bindingDisplay } from "./lib/bindingDisplay";
import { summarizeChangedLines } from "./lib/diff";
import { KeymapLayer, parseKeymap, updateLayerBinding } from "./lib/keymapParser";
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
import { parseTrackballSettings, TrackballSettings } from "./lib/trackballParser";
import "./styles.css";

type ProjectFiles = {
  keymapPath?: string;
  keymap: string;
  leftOverlayPath?: string;
  leftOverlay: string;
  rightOverlayPath?: string;
  rightOverlay: string;
};

const DEFAULT_PROJECT_ROOT = "/Volumes/SSD/ghq/github.com/s-hiraoku/KobitoKey_QWERTY";
const PRESETS = [
  "&trans",
  "&none",
  "&kp ESC",
  "&kp TAB",
  "&kp SPACE",
  "&kp ENTER",
  "&kp BSPC",
  "&kp DEL",
  "&kp LEFT",
  "&kp DOWN",
  "&kp UP",
  "&kp RIGHT",
  "&mo 1",
  "&lt 1 SPACE",
  "&mkp MB1",
  "&mkp MB2",
  "&to 0",
];

function App() {
  const [projectRoot, setProjectRoot] = React.useState(DEFAULT_PROJECT_ROOT);
  const [files, setFiles] = React.useState<ProjectFiles | null>(null);
  const [savedKeymap, setSavedKeymap] = React.useState("");
  const [activeLayerIndex, setActiveLayerIndex] = React.useState(0);
  const [selectedKeyIndex, setSelectedKeyIndex] = React.useState(0);
  const [status, setStatus] = React.useState("fixture を読み込み中");

  React.useEffect(() => {
    loadFixture();
  }, []);

  const layers = React.useMemo(() => parseKeymap(files?.keymap ?? "").layers, [files?.keymap]);
  const activeLayer = layers[activeLayerIndex] ?? layers[0];
  const selectedBinding = activeLayer?.bindings[selectedKeyIndex] ?? "";
  const trackball = React.useMemo(
    () => parseTrackballSettings(files?.leftOverlay ?? "", files?.rightOverlay ?? ""),
    [files?.leftOverlay, files?.rightOverlay],
  );
  const keymapDiff = React.useMemo(
    () => summarizeChangedLines(savedKeymap, files?.keymap ?? ""),
    [files?.keymap, savedKeymap],
  );

  async function loadFixture() {
    const [keymap, leftOverlay, rightOverlay] = await Promise.all([
      fetch("/fixtures/KobitoKey.keymap").then((response) => response.text()),
      fetch("/fixtures/KobitoKey_left.overlay").then((response) => response.text()),
      fetch("/fixtures/KobitoKey_right.overlay").then((response) => response.text()),
    ]);
    setFiles({ keymap, leftOverlay, rightOverlay });
    setSavedKeymap(keymap);
    setStatus("fixture を表示中");
  }

  async function loadProject() {
    try {
      const project = await invoke<ProjectFiles>("read_kobitokey_project", { root: projectRoot });
      setFiles(project);
      setSavedKeymap(project.keymap);
      setStatus("ローカルプロジェクトを読み込みました");
    } catch (error) {
      setStatus(`読み込み失敗: ${String(error)}`);
    }
  }

  async function saveKeymap() {
    if (!files?.keymapPath) {
      downloadText("KobitoKey.keymap", files?.keymap ?? "");
      setStatus("ブラウザ表示のため keymap をダウンロードしました");
      return;
    }

    try {
      await invoke("write_text_file", { path: files.keymapPath, contents: files.keymap });
      setSavedKeymap(files.keymap);
      setStatus("KobitoKey.keymap を保存しました");
    } catch (error) {
      setStatus(`保存失敗: ${String(error)}`);
    }
  }

  function setBinding(nextBinding: string) {
    if (!files || !activeLayer) {
      return;
    }

    setFiles({
      ...files,
      keymap: updateLayerBinding(files.keymap, activeLayer, selectedKeyIndex, nextBinding),
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">KobitoKey Studio</p>
          <h1>KobitoKey 設定エディタ</h1>
        </div>
        <div className="project-loader">
          <input
            aria-label="KobitoKey_QWERTY path"
            value={projectRoot}
            onChange={(event) => setProjectRoot(event.target.value)}
          />
          <button type="button" onClick={loadProject}>
            <FolderOpen size={17} />
            読み込み
          </button>
        </div>
      </header>

      <section className="workspace">
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
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Layer {activeLayerIndex}</p>
              <h2>{activeLayer?.label ?? "No layer"}</h2>
            </div>
            <button type="button" className="primary" onClick={saveKeymap}>
              {files?.keymapPath ? <Save size={17} /> : <Download size={17} />}
              {files?.keymapPath ? "保存" : "書き出し"}
            </button>
          </div>

          <KeyboardGrid
            layer={activeLayer}
            selectedKeyIndex={selectedKeyIndex}
            onSelect={setSelectedKeyIndex}
          />

          <section className="diff-panel">
            <div className="panel-heading compact">
              <h3>保存前 diff</h3>
              <span>{keymapDiff.length === 0 ? "変更なし" : `${keymapDiff.length / 2} 箇所`}</span>
            </div>
            <pre>{keymapDiff.length === 0 ? "No changes" : keymapDiff.join("\n")}</pre>
          </section>
        </section>

        <aside className="inspector">
          <section>
            <p className="eyebrow">Key {selectedKeyIndex + 1}</p>
            <h2>{selectedBinding}</h2>
            <label>
              Binding
              <input value={selectedBinding} onChange={(event) => setBinding(event.target.value)} />
            </label>
            <div className="preset-grid">
              {PRESETS.map((preset) => (
                <button type="button" key={preset} onClick={() => setBinding(preset)}>
                  {preset}
                </button>
              ))}
            </div>
          </section>

          <TrackballPanel settings={trackball} />

          <section className="build-panel">
            <div>
              <p className="eyebrow">Build / Flash</p>
              <h2>アップロード支援</h2>
            </div>
            <ol>
              <li>Git diff を確認して保存</li>
              <li>GitHub Actions の build を起動</li>
              <li>artifact から左右 UF2 を取得</li>
              <li>左右を順番に bootloader へ書き込み</li>
            </ol>
            <button type="button" disabled>
              <UploadCloud size={17} />
              GitHub 連携は次ステップ
            </button>
          </section>
        </aside>
      </section>

      <footer className="statusbar">{status}</footer>
    </main>
  );
}

function KeyboardGrid({
  layer,
  selectedKeyIndex,
  onSelect,
}: {
  layer?: KeymapLayer;
  selectedKeyIndex: number;
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

function TrackballPanel({ settings }: { settings: TrackballSettings }) {
  const rows = [
    ["Left CPI", settings.leftCpi],
    ["Right CPI", settings.rightCpi],
    ["Left accel scale", settings.pointerScaleMultiplier],
    ["Left speed threshold", settings.pointerSpeedThreshold],
    ["Left accel exponent", settings.pointerAccelerationExponent],
    ["Right accel scale", settings.rightPointerScaleMultiplier],
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

function downloadText(filename: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
