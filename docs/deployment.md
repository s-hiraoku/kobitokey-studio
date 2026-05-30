---
layout: page
title: Deployment
permalink: /deployment/
---

# Deployment

このページは、KobitoKey Studio の公開先、リリース確認、ドキュメント更新手順をまとめた運用メモです。

| 対象 | 公開先 | 更新元 |
| --- | --- | --- |
| ブラウザアプリ | <https://kobitokey-studio.s-hiraoku.workers.dev/> | Cloudflare Workers + static assets が `main` から `npm run build` |
| 使い方ガイド | <https://s-hiraoku.github.io/kobitokey-studio/> | GitHub Pages が `docs/` から Jekyll build |

## ブラウザアプリの公開

KobitoKey Studio のブラウザ版は Cloudflare Workers + static assets で公開します。GitHub OAuth device flow と artifact zip proxy のため、同一オリジンの Worker API を使います。

公開 URL:

- <https://kobitokey-studio.s-hiraoku.workers.dev/>

### Cloudflare の build settings

Cloudflare の `Workers & Pages` → `kobitokey-studio` → `Settings` → `Builds & deployments` で確認できます。

| 項目 | 値 |
| --- | --- |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `npm run build` |
| Build output directory | `dist/client` |
| Root directory | `/` |

`main` に push すると自動で production deployment が作られます。

Worker bundle は `src/worker.ts` から作られ、Vite build 後の redirected Wrangler configuration は `dist/kobitokey_studio/wrangler.json` に出力されます。公開前に `npm run check:browser-firmware` を通すと、local `node_modules` の test/build/Wrangler tools を直接使い、OS の一時ディレクトリ配下へ Wrangler log / registry / config / dry-run output を作り、Worker と assets が束ねられることを確認できます。

Worker API は `/api/release-metadata` を `GET`、`/api/github/device-code`、`/api/github/access-token`、`/api/github/artifact-zip` を `POST` のみ受け付けます。`/api/release-metadata` は Vite build 時に埋め込まれた app commit SHA を返し、production preflight と外部 E2E 証跡でデプロイ済みアプリ commit の照合に使います。OAuth response、artifact proxy response、release metadata は `Cache-Control: no-store` を返し、不正 JSON は `invalid_json` の 400 として返します。`assets.run_worker_first` を有効にしているため、static asset と API response の両方が Worker を通り、security headers が付与されます。device-code route は `repo` scope だけを許可し、artifact proxy は GitHub owner / repo / artifact id を検証してから GitHub API へ転送します。production preflight と外部 E2E collector は、artifact proxy が不正な owner / repo path segment と不正な artifact id を GitHub 転送前に拒否することも確認します。

Cloudflare 認証済みの端末から production Worker を更新する場合は、通常の `wrangler deploy` ではなく次を使います。

```sh
npm run deploy:browser-firmware
```

この wrapper は merge readiness、integrated browser Firmware Mode local check、production build、Wrangler deploy、production preflight を順に実行し、post-deploy preflight では `BROWSER_FIRMWARE_PREFLIGHT_APP_COMMIT_SHA` を current git HEAD に固定します。非 dry-run の production deploy では dirty worktree を拒否し、未 commit の差分が current git HEAD として公開済み証跡に混ざらないようにします。GitHub OAuth device flow も本番確認する場合は、公開 OAuth App の client id を渡して OAuth 必須にします。

```sh
BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID=<GitHub OAuth client id> npm run deploy:browser-firmware -- --require-oauth
```

### Environment variables

ブラウザ版 Firmware Mode の `GitHub で接続` ボタンを使うには、GitHub OAuth App の client id を Cloudflare 側に設定します。

| 変数 | 用途 |
| --- | --- |
| `VITE_GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth device flow の client id |

OAuth flow は `repo` scope を要求します。この値が未設定でも、beta UI の token 入力欄に対象 repository の Contents write / Actions write 権限を持つ fine-grained GitHub token を入れれば検証できます。token は browser memory 上だけで使い、local storage には保存しません。

### リリース確認

1. Cloudflare dashboard で `Workers & Pages` → `kobitokey-studio` を開く。
2. `Deployments` で最新 commit が `Production` に出ていることを確認する。
3. Status が成功になったら <https://kobitokey-studio.s-hiraoku.workers.dev/> を開く。
4. PC 幅では通常 UI が表示されることを確認する。
5. スマホ幅では「PC ブラウザでご利用ください」画面が表示されることを確認する。
6. Browser Firmware Mode を公開する場合は、まず `npm run check:browser-firmware` を通す。このコマンドは `scripts/run-browser-firmware-check.mjs` から release audit、external evidence validator self-test、unit tests、production build、Wrangler dry-run deploy packaging を順に確認する。runner は local `node_modules` の test/build/Wrangler tools を直接呼び、`BROWSER_FIRMWARE_TMP_DIR`、`RUNNER_TEMP`、または OS の一時ディレクトリ配下に Wrangler log / registry / config / dry-run output を置くため、ローカル sandbox と GitHub Actions のどちらでもユーザー設定ディレクトリや global `npm` / `npx` の PATH に依存しない。PR / feature branch の Workers preview を先に確認する場合は `BROWSER_FIRMWARE_PRODUCTION_URL=<Workers preview URL with ?mode=firmware> npm run check:browser-firmware:production-preflight` を使う。ただし preview preflight の成功は production 公開の証跡にしない。production deploy は `npm run deploy:browser-firmware` で行い、deploy 後の preflight が current git HEAD と production の `/api/release-metadata` を照合できることを確認する。production URL で release security headers missing、release metadata missing、Worker API の 405 が出る場合は、本番 Worker がまだ対象 commit に更新されていないため公開不可と扱う。公開直前の最終 preflight では `BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID=<GitHub OAuth client id> npm run check:browser-firmware:production-release-preflight` を実行し、`repo` scope の device code が本番 Worker route から発行され、同じ client id が GitHub 接続ボタン用の frontend bundle に含まれ、デプロイ済み app commit が `/api/release-metadata` で取得できることも確認する。続けて QA 端末で `npm run check:browser-firmware:ui` を実行し、[Browser Firmware Release Plan](../browser-firmware-release-plan/) の公開判定チェックリストを実 repository と実機で通す。外部 E2E 証跡は `BROWSER_FIRMWARE_E2E_OAUTH_CLIENT_ID=<GitHub OAuth client id> npm run collect:browser-firmware:e2e-report -- --out <report.json>` で生成し、QA 端末で本番 URL の rendered UI smoke も同時に走らせる場合は `--run-ui-smoke` を付ける。production URL、KobitoKey Studio の Actions run URL / head SHA / status / conclusion、`production.appCommitSha`、API route の security headers、Worker OAuth device-code 発行 / artifact routes、unsupported OAuth scope rejection、Actions run の head SHA / head branch、Actions artifact の name / id / size / expiry、Actions artifact zip 内 UF2 / manifest entry の SHA-256、manifest が指す UF2 と同じ GitHub artifact 内の UF2 entry、left/right の flash method (`direct-copy` または `download-copy`)、bootloader marker、書き込み直前確認 / keyboard half 確認、token 非保存/消去、キー動作 / Combo / Trackball 編集、release wizard precondition、artifact 由来表示と表示 artifact 名 / id の build artifact 一致確認、layer 追加・複製・参照中 layer 削除ブロック・安全な削除の UI smoke 結果を含めて `npm run check:browser-firmware:e2e-report -- <report.json>` で検証する。最後に `BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID=<GitHub OAuth client id> npm run check:browser-firmware:public-release -- --e2e-report <report.json>` を実行し、外部 E2E 証跡 validator、merge readiness、OAuth production preflight を一括で通してから公開判定にする。この最終 gate の preflight 対象 URL は E2E report の `production.url` と一致し、`production.url` は expected public production origin と一致し、`production.fetchUrl` は `production.url` と一致し、E2E report の `ci.runUrl` は `s-hiraoku/kobitokey-studio` の Actions run を指し、`ci.runHeadSha` は `ci.appCommitSha` と一致し、CI run は completed/success であり、E2E report の `production.appCommitSha` は `ci.appCommitSha` と一致し、`ci.appCommitSha` は現在の git `HEAD` と一致している必要がある。独自ドメインへ移行する場合だけ `BROWSER_FIRMWARE_EXPECTED_PRODUCTION_ORIGIN` で expected origin を明示する。

### 独自ドメイン

独自ドメインを使う場合は Cloudflare dashboard で設定します。

1. `Workers & Pages` → `kobitokey-studio` を開く。
2. `Custom domains` を開く。
3. `Set up a custom domain` を押す。
4. 使いたいドメインまたはサブドメインを入力する。
5. Cloudflare が出す DNS 設定を追加する。
6. SSL/TLS が有効になり、Custom domains の status が active になるまで待つ。

ドメイン名が決まるまでは `kobitokey-studio.s-hiraoku.workers.dev` を本番 URL として使います。

### 対応環境

- PC の Chrome / Edge: 対応
- スマホブラウザ: 初版では未対応画面を表示
- Browser release: Direct Mode と Firmware Mode beta
- Tauri desktop release: Direct Mode と Firmware Mode

Direct Mode は Web Serial / Web Bluetooth を使うため、ブラウザ版は HTTPS、`127.0.0.1`、または `localhost` で開く必要があります。

## 使い方ガイドの公開

ガイドの Markdown は `docs/` 配下に置いています。GitHub Pages への公開は `.github/workflows/pages.yml` が担当します。

### GitHub Pages 設定

初回だけ GitHub repository の `Settings` → `Pages` で source を `GitHub Actions` に設定してください。

以後は、`main` への push で次のファイルに変更がある場合だけ Pages workflow が走ります。

- `docs/**`
- `.github/workflows/pages.yml`

公開 URL:

- <https://s-hiraoku.github.io/kobitokey-studio/>
- <https://s-hiraoku.github.io/kobitokey-studio/quick-start/>
- <https://s-hiraoku.github.io/kobitokey-studio/usage-guide/>
- <https://s-hiraoku.github.io/kobitokey-studio/deployment/>

### ドキュメント更新チェック

1. `README.md` はプロジェクト概要、開発コマンド、主要リンクに留める。
2. ユーザー向けの手順は `docs/quick-start.md` または `docs/usage-guide.md` に置く。
3. 公開、リリース確認、Pages 設定はこのページに置く。
4. UI の文言、モード名、ボタン名が `src/main.tsx` と一致しているか確認する。
5. ローカル開発 URL は Vite 設定に合わせて `http://127.0.0.1:1420/` を使う。

### ローカル確認

Markdown のリンクや見出しを変更したら、公開前に該当ページをブラウザで確認してください。GitHub Pages workflow は Jekyll で `docs/` を build し、生成物を Pages artifact として deploy します。
