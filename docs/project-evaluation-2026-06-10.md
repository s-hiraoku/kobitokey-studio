# KobitoKey Studio プロジェクト評価レポート(2026-06-10)

内部向けドキュメント。Jekyll の `exclude:` 対象のため公開ガイドには含まれない。

評価方法: テスト・型チェック・ビルドの実行検証と、4方面(フロントエンド、lib層/Worker、Tauriバックエンド、scripts/CI)のコードレビューに基づく。

## 総合評価: ★★★★☆(良好 — 機能・品質保証は優秀、コード構造に技術的負債)

検証時の実測値:

- ユニットテスト: 15ファイル・172件 全パス(468ms)
- `tsc --noEmit`: エラーゼロ
- 本番ビルド: 成功(JS 434KB / gzip 124KB)
- `console.log` 残骸: 0件、`: any` 乱用: 0件
- `src/main.tsx`: 7,210行、`useState` 71個、`useEffect` 20個
- `src/lib/zmkStudioWeb.ts`: 1,613行
- `src-tauri/src/lib.rs`: 2,800行(Rustテスト13件)
- `scripts/`: 21ファイル・計10,132行

## 強み

### 1. 検証パイプラインが非常に堅実

CI(`pages.yml`)はユニットテスト・型チェック・ビルド・Wrangler dry-run・UIスモークを一括検証する。リリースゲート(E2E証跡バリデータ、production preflight、release-status)は個人プロジェクトとしては異例なほど厳格で、「mainマージ=リリース可能」と誤認しない設計思想は優れている。

### 2. コード衛生が良い

`console.log` 残骸ゼロ、`any` 型の乱用ゼロ。lib層は `fetchImpl` 注入によるテスタブルな設計で、関心の分離も明確。

### 3. セキュリティは概ね健全

Worker の OAuth プロキシは `repo` 以外のスコープを拒否し、client secret を扱わないデバイスフロー設計。CSP・HSTS・X-Frame-Options 等のセキュリティヘッダーも本番/開発で適切に差別化されている。Tauri 側の `gh`/`git` 呼び出しもシェル経由でなく引数配列渡しで、コマンドインジェクションリスクは低い。

### 4. ドキュメントの鮮度

docs/ は直近まで更新されており、README との整合性も取れている。バージョンも package.json / Cargo.toml / tauri.conf.json で 0.1.0 に統一。

## 改善点(優先度順)

### 🔴 高優先度

#### 1. `src/main.tsx` の分割(最大の技術的負債)

7,210行の単一ファイルに `App` コンポーネント約2,750行・`useState` 71個が集中する god component。確認された実害:

- 関連状態(Direct接続系で7つ等)の同期ロジックが複数箇所に重複
- `useEffect` 依存配列の漏れ(例: `main.tsx:737` 付近で `projectDirHandle` が漏れ、stale closure の可能性)
- 状態であるべきものが `useRef` で管理され UI 更新されないリスク(`directWriteRequestRef` 等)
- 書き込みボタン連打時に一部キーだけ書き込まれた状態が残る競合の懸念

推奨: `useDirectConnection` / `useFirmwareEditor` / `useBrowserFirmware` / `useProjectFiles` のカスタムフック分離 + 関連状態の `useReducer` 集約。一括でなくとも、まず `eslint-plugin-react-hooks` の `exhaustive-deps` 導入だけで依存配列バグを機械的に検出できる(数時間で導入可能)。

#### 2. ESLint / Prettier の導入

リンタが一切なく、依存配列漏れのような React 特有のバグを検出する仕組みがない。テスト・型チェックが堅実なだけに、ここだけ穴になっている。

#### 3. LICENSE ファイルの追加

公開デプロイ・公開ガイドがあるのにライセンスが未定義。MIT 等を選定して `LICENSE` を追加し、package.json の `license` フィールドと揃える。

### 🟡 中優先度

#### 4. Worker のアーティファクトプロキシ強化(`src/worker.ts:150-162`)

GitHub API のリダイレクト先を HTTPS であることしか検証していない。`github.com` / `githubusercontent.com` 系へのオリジン制限と、Content-Length によるサイズ上限(例: 50MB)を追加すると、SSRF 耐性と Worker タイムアウト対策になる。

#### 5. 巨大ファイルのモジュール分割(main.tsx 以外)

- `src/lib/zmkStudioWeb.ts`(1,613行): Transport / RPC / Protobuf codec / Keymap / HID マッピングの5モジュールに分割可能
- `src-tauri/src/lib.rs`(2,800行): commands/ device/ git/ models へのモジュール分割。Rust 側はエラーハンドリングが堅牢でテストも13件あり、品質自体は良好

#### 6. scripts/ の共通化

21ファイル・計10,132行のうち `run()`, `git()`, `assert()`, URL検証系などが複数ファイルに重複定義されている。`scripts/lib/helpers.mjs` への抽出で2,000行以上削減できる見込み。self-test パターン自体は健全なので維持で良い。

#### 7. keymapParser のサイレント失敗(`src/lib/keymapParser.ts:79`)

キー数が合わないレイヤーを警告なしでスキップするため、ユーザーがレイヤー消失に気づけない。スキップ情報を戻り値で返して UI に表示すべき。

### 🟢 低優先度

8. **Dependabot / Renovate の導入** — 依存更新が手動管理。
9. **Tauri ビルドの CI 化** — 現状 CI は src-tauri に一切触れておらず、`cargo test` も自動実行されない。
10. **リポジトリルートの整理** — 開発中のスクリーンショット PNG が20枚・計3.7MB ルート直下にコミットされている。`docs/images/` への移動か削除を推奨。
11. **Tauri の CSP 未設定**(tauri.conf.json に `security.csp` なし)と updater 未設定 — ローカル限定配布の現状ではリスク低だが、配布拡大時には必須。
12. **i18n とアクセシビリティ** — 日本語文字列100箇所以上がハードコード、モード切替ボタン等に `aria-pressed` 不足。対象ユーザーが日本語圏である現状では急がないが、構造化だけ先にしておくと後が楽。

## 推奨着手順

効果対コストの観点で:

1. ESLint + react-hooks ルール導入(数時間)— main.tsx 分割で見つかる潜在バグの検出器としても機能する
2. LICENSE 追加(数分)
3. main.tsx のフック分離(3〜5日)
