---
layout: page
title: 公開チェックリスト
permalink: /release-checklist/
---

# 公開チェックリスト

ブラウザ版 Firmware Mode を公開するときは、この順番で確認します。GitHub Pages の成功だけではブラウザアプリ本体の公開完了とは扱いません。

## 1. 現在の残件を見る

```sh
npm run check:browser-firmware:release-status -- --json --e2e-report path/to/report.json
```

`ready` が `false` の場合は `nextActions` に残作業と placeholder 付きの `commands` が出ます。secret 値や token は出力しません。
GitHub Actions から更新する場合は、current HEAD の release gate と production Worker deploy workflow の状態もここで確認できます。

## 2. production deploy の secret を設定する

GitHub Actions から production Worker を更新する場合は、repository / environment に次の secret を設定します。

| secret | 用途 |
| --- | --- |
| `VITE_GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth device flow と production preflight |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Workers deploy |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Workers deploy |

手元で deploy する場合は、`BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID` と Cloudflare の認証状態も確認します。

## 3. production Worker を更新する

GitHub Actions の `Deploy GitHub Pages` workflow を手動実行し、`deploy_browser_firmware_worker` を有効にします。この手動実行では GitHub Pages deploy は skip され、production Worker だけを更新します。

手元で更新する場合は次を使います。

```sh
BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID=github-client-id npm run deploy:browser-firmware
```

## 4. production preflight を通す

production deploy 後に、current commit が production に出ていることを確認します。

```sh
BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID=github-client-id npm run check:browser-firmware:production-release-preflight
```

`release security headers missing`、`release metadata missing`、Worker API の `405` が出る場合は、production Worker がまだ対象 commit に更新されていません。

## 5. 外部 E2E 証跡を作る

QA 端末で本番 URL、GitHub Actions run、artifact、left / right UF2、実機書き込み結果を記録します。

```sh
npm run collect:browser-firmware:e2e-report -- --print-env-template > /tmp/browser-firmware-e2e.env
source /tmp/browser-firmware-e2e.env
npm run collect:browser-firmware:e2e-report -- --out path/to/report.json --run-ui-smoke
```

`BROWSER_FIRMWARE_E2E_BRANCH` には KobitoKey Studio の branch ではなく、`Commit & Build` で使った firmware repository の branch を入れます。

実機確認では、left / right それぞれで bootloader marker、書き込み直前確認、接続中 keyboard half、flash method (`direct-copy` または `download-copy`) を記録します。

## 6. 最終 gate を通す

作業ツリーが clean な状態で、外部 E2E 証跡と production preflight を同じ production URL / commit で照合します。

```sh
BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID=github-client-id npm run check:browser-firmware:public-release -- --e2e-report path/to/report.json
```

この gate が通り、`release-status` の `ready` が `true` になった状態を公開判定にします。
