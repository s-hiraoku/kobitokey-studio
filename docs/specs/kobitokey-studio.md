---
spec_id: kobitokey-studio
version: 1
status: approved
title: KobitoKey Studio Web フロントエンドのビルド・静的解析・振る舞い検証
owner: "@s-hiraoku"
---

## 目的

KobitoKey Studio（ZMK キーマップ設定 Web アプリ）について、Node.js ツールチェーンと依存関係が整った環境で、バージョン整合・静的解析・本番ビルド・キーマップ編集および Direct Mode / Firmware Mode のテストが承認済み仕様どおりに成立することを継続的に検証する。

## 受け入れ条件

- **AC-001**: `.node-version` に定めた Node.js 24 系と npm 依存関係が揃っており、再現可能に検証を実行できる。
- **AC-002**: バージョン整合チェック（`npm run check:version`）、ESLint 警告ゼロ検査（`npm run lint`）、および TypeScript / Vite 本番ビルド（`npm run build`）がエラーなしで完了する。
- **AC-003**: キーマップ編集・Direct Mode・Firmware Mode・UF2 書き込み処理などのテストスイート（`npm test`）が全件合格する。

## 不変条件

- **INV-001**: バージョンメタデータ整合チェックの自己検証（`npm run check:version-self-test`）が常に成立し、メタデータの不一致を確実に検出できる。
