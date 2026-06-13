# KobitoKey Studio プロジェクト評価レポート(2026-06-14 更新)

内部向けドキュメント。Jekyll の `exclude:` 対象のため公開ガイドには含まれない。

評価方法: 現 HEAD の package scripts、release gate、主要 UI/Tauri 差分、docs を確認したコードレビューに基づく。

## 総合評価: ★★★★☆(公開準備は進んでいるが、外部 release 証跡待ち)

現状の要点:

- ESLint は導入済みで、`npm run lint` が `src/**/*.{ts,tsx}` と Vite/Vitest config を検査する。
- Worker は OAuth device flow、artifact proxy、release metadata、security headers を持つ。
- Browser Firmware Mode の release gate は `release-status` / `public-release` / 外部 E2E report に分かれており、secret 値は出力しない。
- Tauri は限定配布扱いだが、今回の更新で汎用 `read_text_file` / `write_text_file` command を削除し、KobitoKey project 専用保存 command と CSP を追加した。
- `src/main.tsx` はまだ大きいが、保存済み firmware snapshot と Browser Firmware release state は hook/reducer に分離済み。
- LICENSE は MIT として追加済み。

## 公開 release gate

`npm run check:browser-firmware:release-status -- --json` は、外部依存を含む gate の状態を返す。

ローカル/PR で改善済み:

- branch freshness: 作業ブランチは `origin/main` 起点に更新。
- Tauri security: 任意パス read/write IPC を削除し、project root 配下の固定 firmware files に限定。
- accessibility: mode toggle は `aria-pressed` / `aria-controls` を持ち、SVG combo label の Space 操作は keyup 発火。
- docs/license: MIT LICENSE と package metadata を追加。

公開判定にまだ外部作業が必要:

- `VITE_GITHUB_OAUTH_CLIENT_ID` と `BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID` を同じ GitHub OAuth App client id に揃える。
- GitHub Actions または認証済みローカル環境で現 HEAD を production Worker に deploy する。
- production `/api/release-metadata` が現 HEAD と OAuth 設定済み状態を返すことを preflight で確認する。
- QA 端末で left/right 実機 flash を行い、外部 E2E report を収集して `check:browser-firmware:public-release` に通す。

## 強み

### 1. Release gate が厳格

GitHub Actions release gate、production preflight、外部 E2E evidence、public-release gate が分離されている。GitHub Pages や PR CI の成功だけを公開完了と誤認しない設計になっている。

### 2. Worker と scripts の検証が厚い

Worker API は route method、OAuth scope、artifact id、security headers、release metadata を検査できる。release handoff / bundle writer もあり、QA 担当への引き継ぎがしやすい。

### 3. Tauri の攻撃面が縮小

ローカル clone を扱う必要は残るが、任意パス read/write command は exposed ではなくなった。保存は `config/KobitoKey.keymap` と左右 overlay に限定され、既存ファイルであることと canonical root 配下であることを確認する。

## 残課題

### 高優先度

1. **公開 release gate の外部証跡完了**
   OAuth client id、Cloudflare deploy secret、production deploy、実機 left/right flash report は repository code だけでは完了しない。公開判定前に `release-status --json --e2e-report ...` と `check:browser-firmware:public-release` を通す。

2. **`src/main.tsx` の継続分割**
   今回は `useFirmwareProjectSnapshot` と `useBrowserFirmwareRelease` を切り出した。次は Direct connection、Firmware project loading/saving、GitHub OAuth flow、flash workflow の順で分けると安全。

### 中優先度

3. **Tauri CI**
   `cargo test` はローカルで走るが、通常 CI の必須 gate にはまだ入っていない。Tauri を配布対象に広げるなら GitHub Actions に追加する。

4. **`src-tauri/src/lib.rs` のモジュール分割**
   commands、firmware project IO、git/gh wrapper、Studio transport、models/tests に分ける余地がある。

5. **scripts 共通化**
   release scripts は機能豊富だが、共通 helper の重複が残る。挙動を変えずに `scripts/lib/` へ段階抽出するのがよい。

### 低優先度

6. Dependabot / Renovate の導入。
7. i18n 方針の整理。
8. Tauri updater / signing / notarization 方針の文書化。

## 推奨着手順

1. 現 PR の CI と reviewer feedback を処理する。
2. OAuth / Cloudflare secret を設定し、現 HEAD の production Worker deploy を実施する。
3. 外部 E2E report を QA 端末で作成し、`check:browser-firmware:public-release` を通す。
4. release 後に `src/main.tsx` の残り workflow 分割を継続する。
