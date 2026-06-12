---
layout: page
title: 公開チェックリスト
permalink: /release-checklist/
---

# 公開チェックリスト

ブラウザ版 Firmware Mode を公開するときは、この順番で確認します。GitHub Pages の成功だけではブラウザアプリ本体の公開完了とは扱いません。

## 0. version metadata を揃える

公開する app version を先に決め、`package.json` / `package-lock.json` / `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock` / `src-tauri/tauri.conf.json` / `CHANGELOG.md` を同じ version にします。

```sh
npm run set:version -- 0.2.0
npm run check:version
```

`package.json` を version の基準にし、他のファイルがズレている場合は `check:version` が失敗します。version を変えない patch でも、公開前には `CHANGELOG.md` に現在 version の entry があることを確認します。

## 1. 現在の残件を見る

```sh
npm run check:browser-firmware:release-status -- --json
```

`ready` が `false` の場合は `nextActions` に残作業と placeholder 付きの `commands` が出ます。secret 値や token は出力しません。
外部 E2E の action には、current production URL、app commit SHA、release gate Actions run URL を事前入力した env-template seed command が含まれます。
GitHub Actions から更新する場合は、current HEAD の release gate と production Worker deploy workflow の状態もここで確認できます。
外部 E2E report をまだ作っていない初回確認では `--e2e-report` を付けません。report 作成後、または GitHub API rate limit で release gate を読めない場合は、current app commit の検証済み外部 E2E report を `--e2e-report` で渡します。その report から release gate 成功を証明できる場合、deploy workflow job を GitHub から直接読めなかったことは warning として残ります。

```sh
npm run check:browser-firmware:release-status -- --json --e2e-report path/to/report.json
```

公開作業を引き継ぐ場合は、同じ内容を Markdown にします。

```sh
npm run write:browser-firmware:release-handoff -- --e2e-report path/to/report.json --out /tmp/browser-firmware-release-handoff.md
```

handoff には production origin で確認する目的別公開リンク、release gate / deploy workflow の evidence links、current app commit / release gate run URL を事前入力する E2E env-template seed command、外部 E2E report に必要な `ui.publicEntryLinksPassed` / `ui.publicEntryUrls` も含まれます。

QA 担当者へ渡す一式を作る場合は、status JSON、handoff、prefill 済み `browser-firmware-e2e.env`、README を同じ directory に出します。`BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID` または `VITE_GITHUB_OAUTH_CLIENT_ID` が設定済みなら、E2E env template も同じ公開 OAuth client id を使います。

```sh
npm run write:browser-firmware:release-bundle -- --out-dir /tmp/browser-firmware-release-bundle
```

## 2. production deploy の secret を設定する

GitHub OAuth App は GitHub の `Settings` → `Developer settings` → `OAuth apps` で作成します。詳細は GitHub Docs の [Creating an OAuth app](https://docs.github.com/en/developers/apps/creating-an-oauth-app) と [Device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow) を確認します。`Homepage URL` は `https://kobitokey-studio.s-hiraoku.workers.dev/`、`Authorization callback URL` は同じ production origin 配下の URL を入れ、`Enable Device Flow` を有効にします。ブラウザ Firmware Mode の device flow は client secret を使わず、公開 client id だけを `VITE_GITHUB_OAUTH_CLIENT_ID` に設定します。

GitHub Actions から production Worker を更新する場合は、repository / environment に次の secret を設定します。

| secret | 用途 |
| --- | --- |
| `VITE_GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth device flow と production preflight |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Workers deploy |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Workers deploy |

手元で deploy する場合は、`VITE_GITHUB_OAUTH_CLIENT_ID` と `BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID` を同じ GitHub OAuth App client id にし、Cloudflare の認証状態も確認します。`release-status` で `frontend OAuth client id env` warning が出る場合は、手元の production deploy は拒否されるため、この 2 つを揃えてから進めます。

## 3. production Worker を更新する

GitHub Actions の `Deploy GitHub Pages` workflow を手動実行し、`deploy_browser_firmware_worker` を有効にします。この手動実行では GitHub Pages deploy は skip され、production Worker だけを更新します。GitHub CLI を使う場合は次を実行します。

```sh
gh workflow run pages.yml --ref main -f deploy_browser_firmware_worker=true
```

Actions deploy 後に手元で `release-status` を再確認する場合は、production deploy に使ったものと同じ公開 OAuth client id を local env にも入れてから実行します。

```sh
export VITE_GITHUB_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'
export BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'
npm run check:browser-firmware:release-status -- --json
```

手元で更新する場合は次を使います。

```sh
VITE_GITHUB_OAUTH_CLIENT_ID=github-client-id BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID=github-client-id npm run deploy:browser-firmware
```

## 4. production preflight を通す

production deploy 後に、current commit が production に出ていることを確認します。

```sh
VITE_GITHUB_OAUTH_CLIENT_ID=github-client-id BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID=github-client-id npm run check:browser-firmware:production-release-preflight
```

`release security headers missing`、`release metadata missing`、Worker API の `405` が出る場合は、production Worker がまだ対象 commit に更新されていません。

## 5. 外部 E2E 証跡を作る

QA 端末で本番 URL、GitHub Actions run、artifact、left / right UF2、実機書き込み結果を記録します。
env template の `<...>` placeholder と numeric run id の未入力は collector が起動直後に拒否します。

```sh
npm run collect:browser-firmware:e2e-report -- --print-env-template > /tmp/browser-firmware-e2e.env
source /tmp/browser-firmware-e2e.env
npm run collect:browser-firmware:e2e-report -- --out path/to/report.json --run-ui-smoke
```

`BROWSER_FIRMWARE_E2E_BRANCH` には KobitoKey Studio の branch ではなく、`Commit & Build` で使った firmware repository の branch を入れます。

手動で `docs/browser-firmware-e2e-evidence.template.json` を埋める場合は、manifest 分類の証跡として `build.githubArtifactManifests[].targets.left/right` に artifact zip 内の left / right UF2 path を入れます。

UI 証跡では `ui.publicEntryLinksPassed` を `true` にし、`ui.publicEntryUrls` に production origin の `?mode=firmware`、`?mode=firmware&tab=combos`、`?mode=firmware&tab=trackball`、`?mode=firmware&tab=diff`、`?mode=firmware&tab=build`、`?mode=direct` をすべて入れます。

実機確認では、left / right それぞれで bootloader marker、書き込み直前確認、接続中 keyboard half、flash method (`direct-copy` または `download-copy`) を記録します。`flash.left.completedAt`、`flash.right.completedAt`、`verifiedAt` は ISO UTC にし、right の完了時刻は left と同時刻または後、`verifiedAt` は左右の完了時刻と同時刻または後にします。env template には、各 flash 直後に `date -u` で UTC timestamp を記録する copy-ready command も含まれます。

## 6. 最終 gate を通す

作業ツリーが clean な状態で、外部 E2E 証跡、production preflight、`release-status` の `ready: true` を同じ production URL / commit で照合します。

```sh
VITE_GITHUB_OAUTH_CLIENT_ID=github-client-id BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID=github-client-id npm run check:browser-firmware:public-release -- --e2e-report path/to/report.json
```

この gate は `release-status` の `ready: true` も同じ E2E report で確認します。通った状態を公開判定にします。
