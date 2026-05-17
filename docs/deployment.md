---
layout: page
title: Deployment
permalink: /deployment/
---

# Deployment

このページは、KobitoKey Studio の公開先、リリース確認、ドキュメント更新手順をまとめた運用メモです。

| 対象 | 公開先 | 更新元 |
| --- | --- | --- |
| ブラウザアプリ | <https://kobitokey-studio.pages.dev/> | Cloudflare Pages が `main` から `npm run build` |
| 使い方ガイド | <https://s-hiraoku.github.io/kobitokey-studio/> | GitHub Pages が `docs/` から Jekyll build |

## ブラウザアプリの公開

KobitoKey Studio のブラウザ版は Cloudflare Pages で公開します。

公開 URL:

- <https://kobitokey-studio.pages.dev/>

### Cloudflare Pages の build settings

Pages project の `Settings` → `Builds & deployments` で確認できます。

| 項目 | 値 |
| --- | --- |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |

`main` に push すると自動で production deployment が作られます。

### リリース確認

1. Cloudflare dashboard で `Workers & Pages` → `kobitokey-studio` を開く。
2. `Deployments` で最新 commit が `Production` に出ていることを確認する。
3. Status が成功になったら <https://kobitokey-studio.pages.dev/> を開く。
4. PC 幅では通常 UI が表示されることを確認する。
5. スマホ幅では「スマホは未対応でーす」画面が表示されることを確認する。

### 独自ドメイン

独自ドメインを使う場合は Cloudflare dashboard で設定します。

1. `Workers & Pages` → `kobitokey-studio` を開く。
2. `Custom domains` を開く。
3. `Set up a custom domain` を押す。
4. 使いたいドメインまたはサブドメインを入力する。
5. Cloudflare が出す DNS 設定を追加する。
6. SSL/TLS が有効になり、Custom domains の status が active になるまで待つ。

ドメイン名が決まるまでは `kobitokey-studio.pages.dev` を本番 URL として使います。

### 対応環境

- PC の Chrome / Edge: 対応
- スマホブラウザ: 初版では未対応画面を表示
- Browser release: Direct Mode のみ
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
