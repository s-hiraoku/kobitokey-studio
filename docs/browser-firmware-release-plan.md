---
layout: page
title: Browser Firmware Release Plan
permalink: /browser-firmware-release-plan/
---

# Browser Firmware Release Plan

この計画のゴールは、ブラウザ版の Firmware Mode を「ユーザーが迷わず、変更内容が入った firmware を左右へ安全に書き込める」状態で公開することです。

## 公開条件

- ユーザーは `git clone`、`git commit`、`git push`、`gh auth login` を知らなくても完了できる。
- build 対象の commit が画面に表示され、artifact はその commit の成功 run からだけ取得される。
- left / right UF2 はアプリが分類し、ユーザーが左右の UF2 ファイルを手で選ばない。
- 左側ステップでは left UF2 だけ、右側ステップでは right UF2 だけを書き込める。
- 失敗時は原因だけでなく、次に行う操作を表示する。
- 途中で閉じても、GitHub repository、branch、commit、run、flash 進捗から再開できる。

## 推奨アーキテクチャ

ブラウザ公開版は、Tauri のローカルコマンドに依存しない GitHub 連携モードとして実装する。

1. Browser app が GitHub 接続を開始する。
2. GitHub OAuth device flow で user token を取得する。GitHub OAuth endpoint と artifact zip は CORS 制約があるため、同一オリジンの Cloudflare Worker API で proxy する。
3. Browser app は GitHub API で repository / branch / firmware files を読む。
4. 編集後、Browser app は GitHub API 経由で commit を作成する。
5. commit SHA を保持して GitHub Actions workflow dispatch を実行する。
6. 対象 run id を保持し、完了まで status を poll する。
7. success run から artifact を取得し、left / right UF2 を分類する。
8. ユーザーが bootloader folder を選択し、File System Access API で該当 UF2 をコピーする。対応しないブラウザでは UF2 download + 手動コピーに fallback する。

## 実装フェーズ

### Phase 0: 安全ロジック

- Firmware release の状態遷移を純粋関数化する。
- UF2 artifact の left / right 分類を純粋関数化する。
- commit / build / artifact / flash の gate をテストする。

### Phase 1: ブラウザ Firmware Mode の読み込み

- browser release wizard を追加する。
- GitHub 未接続、repository 未選択、files 未読み込みの empty state を作る。
- 既存 fixture 表示と実 repository 読み込みを明確に分ける。

### Phase 2: GitHub 認証と repository 読み込み

- GitHub OAuth device flow を実装する。
- repository / branch 選択 UI を作る。
- `config/KobitoKey.keymap` と左右 overlay を GitHub Contents API から読む。

### Phase 3: Commit & Build

- diff review 後だけ commit を許可する。
- GitHub API で 3 files の commit を作成する。
- workflow dispatch を commit branch / ref に紐づける。
- run id、run URL、commit SHA を画面と local storage に保持する。

### Phase 4: Artifact

- run success 後だけ artifact 取得を許可する。
- artifact zip を展開し、UF2 を left / right に分類する。
- left / right が一意に分類できない場合は flash を止める。

### Phase 5: Flash Wizard

- `左側を書き込む`、`右側を書き込む` の順に固定する。
- ユーザーが選ぶのは bootloader folder だけにする。
- 選択された folder は `INFO_UF2.TXT` または `CURRENT.UF2` を持つ UF2 bootloader volume か確認し、通常フォルダなら書き込まず選び直しを促す。
- File System Access API が使えない場合や直接コピーがうまくいかない場合は、side 固定の UF2 download に fallback できる。
- flash 完了状態を local storage に保存し、再開できるようにする。

## 現在の実装状態

- `src/lib/firmwareReleaseFlow.ts` に release gate と UF2 分類ロジックを置く。
- `src/lib/firmwareReleaseFlow.test.ts` で公開条件に直結する判断を固定する。
- `src/lib/githubFirmware.ts` に GitHub repository、firmware file path、workflow URL、commit plan の境界を置く。
- `src/lib/githubFirmwareClient.ts` に GitHub Contents / Git Data / Actions API client を置く。
- ブラウザ版の `Build & Flash` ボタンでは GitHub OAuth device flow または GitHub token のメモリ入力で接続し、repository 読み込み、commit、workflow dispatch、対象 commit の run 自動確認、artifact zip 展開、left / right UF2 分類まで進められる。OAuth flow は `repo` scope を要求し、fine-grained token を使う場合は対象 repository の Contents write / Actions write に絞る。
- `Build & Flash` は Combo / Trackball / Diff の編集 tab ではなく、`編集をリセット` と並ぶ firmware action として表示する。Build & Flash パネル表示中は編集 tab を隠し、パネル内の `編集に戻る` で直前の編集 tab に戻れる。`編集をリセット` は keymap と左右 overlay の未 commit / 未保存変更を読み込み時点へ戻し、古い commit / run / artifact / flash 進捗を閉じる。
- repository と branch が揃うまで GitHub 読み込み、commit、build、artifact、flash は進めない。branch は API 呼び出し前に trim し、空なら release gate で止める。
- commit 成功後に workflow dispatch だけ失敗した場合は、commit SHA を保持したまま `Build 起動` で build だけを再試行できる。
- Artifact 取得直前には run id の実体を GitHub API で再確認し、画面上の commit SHA と `head_sha` が一致し、run の `head_branch` が選択 branch と一致し、かつ run が success の場合だけ zip を取得する。
- `Artifact 取得` を再実行する時点で、前回の UF2 bytes と左右 flash 完了状態をメモリから破棄し、再確認に失敗した古い artifact では flash gate を開かない。
- Flash gate は commit SHA、成功 build run id、left / right artifact 分類が揃っている場合だけ開く。
- GitHub から読み込んだ時点の branch head SHA を保持し、commit 直前の branch head が変わっている場合は stale な編集内容で上書きせず、読み込み直しを求める。
- GitHub API 失敗時は 401 / 403 / 404 / 409 / 422 / rate limit をユーザー向けに変換し、再接続、scope 確認、repository / branch 確認、再読み込みなどの次アクションを表示する。
- Artifact に `manifest.json` または `firmware-manifest.json` が含まれる場合は、manifest を優先して left / right UF2 を分類する。manifest がない場合はファイル名 token で分類する。manifest が left / right を同じ UF2 に割り当てる場合は完全な左右 artifact として扱わず、分類済み target を release gate に渡して flash gate で止める。
- left / right が別パスでも同じ UF2 basename になる場合は、download fallback と確認ダイアログで区別できないため flash gate を開かない。
- `src/worker.ts` が OAuth device flow と artifact zip download の same-origin API を提供する。API は `POST` のみ受け付け、不正 JSON を 400 で返し、OAuth / artifact response を `no-store` にし、static asset と API response の両方に release security headers を付け、artifact proxy の owner / repo / artifact id を検証してから GitHub へ転送する。artifact zip の redirect は Worker が手動で追跡し、redirect 先の download URL へは GitHub token を転送しない。
- Worker は静的アセット応答に CSP、`Referrer-Policy: no-referrer`、`X-Content-Type-Options: nosniff`、不要な browser permission を閉じる `Permissions-Policy` を付ける。
- ブラウザ flash は File System Access API の `showDirectoryPicker()` で bootloader folder を選び、`INFO_UF2.TXT` または `CURRENT.UF2` を検出できた volume にだけ UF2 を書き込む。対応しない環境や直接コピーがうまくいかない環境では、side 固定の UF2 download と手動コピー完了記録に fallback できる。
- repository、branch、commit、run、flash 進捗は local storage に保存し、token と UF2 bytes は保存しない。復元時は commit / run / successful build の依存関係を満たさない古い進捗を破棄し、right 完了は left 完了がある場合だけ復元する。

## 残っている公開前タスク

- GitHub OAuth device flow の scope / rate limit を実環境で確認する。
- Worker proxy の production deploy と artifact download を実 repository で確認する。
- 実 repository と実 GitHub Actions で end-to-end QA を行う。
- 左右 bootloader folder の確認ダイアログと keyboard half チェックが、実機手順で迷わず通じることを確認する。
- GitHub Actions の `Deploy GitHub Pages / Browser firmware release gates` が対象 branch / PR で通ることを確認する。
- QA 端末で `npm run check:browser-firmware:ui` を実行し、Build & Flash の button layout、右ペイン整理、token 非保存/消去、layer 追加・複製・参照中 layer 削除ブロック・最後の layer 削除だけが使えることをレンダリング結果で確認する。
- 外部 E2E の証跡を `npm run collect:browser-firmware:e2e-report -- --out <report.json>` で生成し、left/right それぞれの flash method (`direct-copy` または `download-copy`)、bootloader marker、書き込み直前確認、接続中 keyboard half 確認を記録したうえで `npm run check:browser-firmware:e2e-report -- <report.json>` で検証する。

## 公開判定チェックリスト

ブラウザ Firmware Mode を安心公開版として扱う前に、次を同じ repository / branch / keyboard で通す。

### 1. ローカル検証

1. `npm run check:browser-firmware` が通る。このコマンドは `scripts/run-browser-firmware-check.mjs` から `scripts/check-browser-firmware-release.mjs` の release audit、unit tests、production build、Wrangler dry-run deploy packaging を順に実行する。Wrangler dry-run のログと output は `BROWSER_FIRMWARE_TMP_DIR`、`RUNNER_TEMP`、または OS の一時ディレクトリ配下に逃がし、sandbox や CI のユーザー設定ディレクトリ権限に依存しない。
2. `npm test`、`npm run build`、`wrangler deploy --dry-run` が順に通り、Worker と static assets が同じ deploy bundle に入る。
3. Wrangler が local sandbox 上で log file の EPERM を出しても、command exit code が 0 で assets directory を読めていれば dry-run は成功扱いにできる。
4. `npm run check:browser-firmware:merge-readiness` が通り、作業ツリーが clean で、branch が `origin/main` に遅れておらず、non-destructive merge check で conflict が出ないことを確認する。
5. `http://127.0.0.1:1420/?mode=firmware` で `Firmware` が開き、`Build & Flash` ボタンから GitHub wizard が表示される。
6. GitHub wizard に `GitHub Commit & Build`、`Firmware repository`、`Branch`、`GitHub から読み込み`、`Commit & Build`、`Build 起動`、`Artifact 取得`、release checks、`UF2 → Bootloader`、left/right 書き込みボタンが表示される。
7. `/api/release-metadata` と `/api/github/device-code` が same-origin Worker route として応答する。
8. PR / feature branch では `BROWSER_FIRMWARE_PRODUCTION_URL=<Workers preview URL with ?mode=firmware> npm run check:browser-firmware:production-preflight` で preview を確認できる。ただし preview preflight の成功は production 公開の証跡にしない。production deploy 後に `npm run check:browser-firmware:production-preflight` を実行し、`?mode=firmware` URL、release security headers、`/api/release-metadata`、Worker API routes、unsupported OAuth scope rejection が本番で通ることを確認する。production URL で release security headers missing、release metadata missing、Worker API の 405 が出る場合は、本番 Worker がまだ対象 commit に更新されていないため公開不可と扱う。公開直前の最終 preflight では `BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID=<GitHub OAuth client id> npm run check:browser-firmware:production-release-preflight` を実行し、`repo` scope の device code が本番 Worker route から発行され、同じ client id が GitHub 接続ボタン用の frontend bundle に含まれ、デプロイ済み app commit が `/api/release-metadata` で取得できることも確認する。
9. GitHub Actions の `Deploy GitHub Pages / Browser firmware release gates` が通る。この workflow は `npm run check:browser-firmware` に加えて Playwright Chromium を入れ、`npm run check:browser-firmware:ui` で rendered UI smoke も実行する。GitHub Pages deploy は `main` push または手動実行時だけ動き、PR と feature branch push では公開ゲートだけを実行する。
10. QA 端末で `npm run check:browser-firmware:ui` を実行し、`?mode=firmware` の Build & Flash が Chrome/Edge 相当で描画されること、Build/Flash ボタンと `編集をリセット` ボタンが編集 tab の外に並び、Build & Flash パネル中は編集 tab が隠れて `編集に戻る` で復帰できること、ボタン表示が崩れないこと、右ペインが key inspector だけになっていること、キー動作 / Combo / Trackball 編集が表示と Diff に反映されること、`編集をリセット` が Diff を消して読み込み時点へ戻すこと、release wizard が未接続・token 入力後・未ロード状態を正しく止めること、token が localStorage に残らず消去ボタンで消えること、layer 追加・複製が使えて参照中 layer と最後以外の layer は削除できないことを確認する。Codex sandbox など macOS のブラウザプロセス制限がある環境では、通常の `npm run check:browser-firmware` と外部証跡 gate を優先する。
11. 公開判定に使う外部 E2E 証跡ファイルは、可能なら `BROWSER_FIRMWARE_E2E_OAUTH_CLIENT_ID=<GitHub OAuth client id> npm run collect:browser-firmware:e2e-report -- --out <report.json>` で生成する。QA 端末で production URL の rendered UI smoke も同時に実行できる場合は `--run-ui-smoke` を付ける。collector は production URL、`production.appCommitSha`、API route の security header / Worker route、OAuth scope 制限、本番 Worker route 経由の OAuth device-code 発行、GitHub commit の変更ファイル一覧、Actions run の head SHA / head branch、Actions artifact の name / id / size / expiry、Actions artifact zip 内の UF2 entry name / SHA-256、manifest entry name / SHA-256、左右 UF2 の SHA-256 を収集し、生成後に validator へ通す。手動で作る場合は `docs/browser-firmware-e2e-evidence.template.json` を元に verifier、`?mode=firmware` 付き production URL、production app commit SHA、CI run、GitHub run、artifact、flash method (`direct-copy` または `download-copy`)、flash 結果、Build & Flash / token 非保存と消去 / key editing / Combo / Trackball / release wizard precondition / layer 操作 smoke 結果を埋める。token と UF2 bytes は記録しない。validator は template placeholder、Firmware Mode 以外の production URL、feature preview など expected public production origin 以外の URL、`production.fetchUrl` が `production.url` と違う証跡、`production.appCommitSha` が `ci.appCommitSha` と違う証跡、production/API security headers 未確認、Worker OAuth device-code 発行未確認、GitHub commit / run URL の repository 不一致、Actions run の head SHA 不一致、Actions run の head branch と選択 branch の不一致、managed firmware files 以外を含む commit、missing / expired / empty Actions artifact、Actions artifact zip 内 UF2 と一致しない left/right UF2 hash、manifest 分類なのに manifest entry 証跡がない場合、filename 分類なのに left/right token がない場合、placeholder hash、CI 未通過、left/right の flash method 未記録、bootloader marker 未確認、書き込み直前確認未実施、keyboard half 未確認、UI smoke 未実行、token 非保存/消去 smoke 未実行、キー動作 / Combo / Trackball 編集 smoke 未実行、release wizard precondition smoke 未実行、layer 追加・複製・参照中 layer 削除ブロック・安全な削除の smoke 未実行を拒否する。最後の公開判定では `BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID=<GitHub OAuth client id> npm run check:browser-firmware:public-release -- --e2e-report <report.json>` を実行し、merge readiness、OAuth production preflight、外部 E2E 証跡 validator を一括で通す。この最終 gate の preflight 対象 URL は E2E report の `production.url` と一致し、`production.url` は expected public production origin と一致し、`production.fetchUrl` は `production.url` と一致し、E2E report の `production.appCommitSha` は `ci.appCommitSha` と一致し、`ci.appCommitSha` は現在の git `HEAD` と一致している必要がある。独自ドメインへ移行する場合だけ `BROWSER_FIRMWARE_EXPECTED_PRODUCTION_ORIGIN` で expected origin を明示する。

### 2. GitHub E2E

1. Cloudflare production に `VITE_GITHUB_OAUTH_CLIENT_ID` を設定する。
2. PC の Chrome / Edge で公開 URL を開き、`Firmware` → `Build & Flash` ボタンで GitHub wizard を開く。
3. `GitHub で接続` で device flow を完了する。新規タブが popup block された場合も、画面上の `GitHub 認証を開く` リンクから認証を開けることを確認する。client id 不備、認証キャンセル、期限切れが画面上の失敗メッセージとして返ることも確認する。
4. `Firmware repository` と `Branch` を指定し、`GitHub から読み込み` で `config/KobitoKey.keymap` と左右 overlay が読み込まれる。
5. keymap か overlay を 1 箇所だけ変更し、`Diff 確認済み` → `Commit & Build` を押す。
6. 画面に commit SHA が表示され、GitHub 上でも同じ commit に 3 managed files だけが含まれることを確認する。
7. `GitHub から読み込み` 後に branch が別 commit へ進んでいる場合、`Commit & Build` は上書きせず読み込み直しを促す。
8. workflow dispatch が失敗しても commit SHA が残り、`Build 起動` で同じ commit の workflow dispatch を再試行できる。
9. workflow dispatch 後、対象 commit の run URL が画面に表示される。
10. run 成功後、`Artifact 取得` が有効になり、artifact zip が取得される。
11. artifact に manifest がある場合は manifest の left / right 指定が優先され、ない場合は UF2 filename token で分類される。manifest が left / right を同じ UF2 に割り当てた場合は、左右 artifact 不足として flash に進めない。
12. build 対象 commit と artifact 取得元 run の head SHA が一致し、artifact 取得元 run の head branch が選択 branch と一致する。
13. GitHub E2E の結果を証跡ファイルに記録し、commit SHA、run URL、artifact 取得、left/right UF2 の SHA-256 を残す。

### 3. Flash E2E

1. left half を bootloader mode にする。
2. `Left を書き込み` だけが有効で、right は left 完了まで有効にならない。
3. folder picker で通常フォルダを選ぶと書き込みが止まり、bootloader volume の選び直しを促す。
4. 確認ダイアログで接続中の keyboard half が Left 側であることをチェックし、folder picker で left bootloader volume を選び、left UF2 だけが書き込まれる。
5. left 完了後、`Right を書き込み` が有効になる。
6. right half を bootloader mode にし、確認ダイアログで Right 側であることをチェックしてから、right UF2 だけを書き込む。
7. 両側を書き込んだ後、release gate が完了状態になる。
8. 画面を再読み込みしても repository、branch、commit、run、flash 進捗が復元され、token と UF2 bytes は保存されていないことを確認する。
9. `showDirectoryPicker()` がない環境、または直接コピーを使わない場合は、確認ダイアログを通してから `Left UF2 をダウンロード` / `Right UF2 をダウンロード` に fallback し、手動コピー後に同じ side のボタンで完了記録できることを確認する。
10. 証跡ファイルの `flash.left` / `flash.right`、`persistence`、`ui` を実結果で埋め、left/right それぞれで確認ダイアログを受け入れ、接続中の keyboard half が正しい side だったことをチェックしたうえで記録し、`npm run check:browser-firmware:e2e-report -- <report.json>` が通ることを公開前の最終 gate にする。
