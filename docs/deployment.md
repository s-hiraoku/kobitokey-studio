---
layout: page
title: Deployment
permalink: /deployment/
---

# Deployment

KobitoKey Studio のブラウザ版は Cloudflare Pages で公開します。

公開 URL:

- <https://kobitokey-studio.pages.dev/>

## Cloudflare Pages の build settings

Pages project の `Settings` → `Builds & deployments` で確認できます。

| 項目 | 値 |
| --- | --- |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |

`main` に push すると自動で production deployment が作られます。

## リリース確認

1. Cloudflare dashboard で `Workers & Pages` → `kobitokey-studio` を開く。
2. `Deployments` で最新 commit が `Production` に出ていることを確認する。
3. Status が成功になったら <https://kobitokey-studio.pages.dev/> を開く。
4. PC 幅では通常 UI が表示されることを確認する。
5. スマホ幅では「スマホは未対応でーす」画面が表示されることを確認する。

## 独自ドメイン

独自ドメインを使う場合は Cloudflare dashboard で設定します。

1. `Workers & Pages` → `kobitokey-studio` を開く。
2. `Custom domains` を開く。
3. `Set up a custom domain` を押す。
4. 使いたいドメインまたはサブドメインを入力する。
5. Cloudflare が出す DNS 設定を追加する。
6. SSL/TLS が有効になり、Custom domains の status が active になるまで待つ。

ドメイン名が決まるまでは `kobitokey-studio.pages.dev` を本番 URL として使います。

## 対応環境

- PC の Chrome / Edge: 対応
- スマホブラウザ: 初版では未対応画面を表示
- Browser release: Direct Mode のみ
- Tauri desktop release: Direct Mode と Firmware Mode

Direct Mode は Web Serial / Web Bluetooth を使うため、ブラウザ版は HTTPS または localhost で開く必要があります。
