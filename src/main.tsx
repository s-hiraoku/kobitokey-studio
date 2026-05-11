import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { Download, FolderOpen, Save, UploadCloud } from "lucide-react";
import { bindingDisplay } from "./lib/bindingDisplay";
import { summarizeChangedLines } from "./lib/diff";
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
  const [selectedComboId, setSelectedComboId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState("fixture を読み込み中");

  React.useEffect(() => {
    loadFixture();
  }, []);

  const parsedKeymap = React.useMemo(() => parseKeymap(files?.keymap ?? ""), [files?.keymap]);
  const layers = parsedKeymap.layers;
  const combos = parsedKeymap.combos;
  const activeLayer = layers[activeLayerIndex] ?? layers[0];
  const selectedBinding = activeLayer?.bindings[selectedKeyIndex] ?? "";
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
            combos={combos}
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

          <ComboPanel combos={combos} selectedCombos={selectedCombos} onSelect={setSelectedComboId} />
          <ComboEditor
            combo={selectedCombo}
            onCreate={createCombo}
            onDelete={removeCombo}
            onSave={saveCombo}
            onSelect={setSelectedComboId}
          />

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

type ComboFormValue = {
  binding: string;
  keyPositions: string;
  timeoutMs: number;
};

function KeyboardGrid({
  combos,
  layer,
  selectedKeyIndex,
  onSelect,
}: {
  combos: KeymapCombo[];
  layer?: KeymapLayer;
  selectedKeyIndex: number;
  onSelect: (index: number) => void;
}) {
  const combosByKey = React.useMemo(() => {
    const map = new Map<number, KeymapCombo[]>();
    combos.forEach((combo) => {
      combo.keyPositions.forEach((position) => {
        map.set(position, [...(map.get(position) ?? []), combo]);
      });
    });
    return map;
  }, [combos]);

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
            comboCount={combosByKey.get(key.index)?.length ?? 0}
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
  comboCount,
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
  comboCount: number;
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
      {comboCount > 0 ? <span className="combo-dot">{comboCount}</span> : null}
    </button>
  );
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
      <p className="eyebrow">Combos</p>
      <h2>コンボ</h2>
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
        <button type="button" onClick={onCreate}>
          追加
        </button>
      </div>
      {combo ? (
        <div className="combo-editor">
          <label>
            Keys
            <input
              value={form.keyPositions}
              onChange={(event) => setForm({ ...form, keyPositions: event.target.value })}
              onFocus={() => onSelect(combo.id)}
            />
          </label>
          <label>
            Binding
            <input
              value={form.binding}
              onChange={(event) => setForm({ ...form, binding: event.target.value })}
              onFocus={() => onSelect(combo.id)}
            />
          </label>
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
            <button type="button" onClick={() => onSave(combo, form)}>
              更新
            </button>
            <button type="button" onClick={() => onDelete(combo)}>
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

function parseDisplayKeyPositions(value: string): number[] {
  return value
    .split(/[\s,]+/)
    .map((item) => Number(item.trim()))
    .filter((number) => Number.isFinite(number) && number >= 1 && number <= 40)
    .map((number) => number - 1);
}

function nextComboId(combos: KeymapCombo[]): string {
  const existing = new Set(combos.map((combo) => combo.id));
  let index = combos.length + 1;
  while (existing.has(`combo_custom_${index}`)) {
    index += 1;
  }
  return `combo_custom_${index}`;
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
