---
layout: page
title: ユーザガイド
permalink: /user-guide/
---

# ユーザガイド

KobitoKey Studio は PC の Chrome / Edge で使う設定ツールです。まず目的に合う入口からアプリを開いてください。

## 目的別に開く

| 目的 | アプリを開く | 使う画面 |
| --- | --- | --- |
| keymap を編集する | [Firmware Mode / Combos](https://kobitokey-studio.pages.dev/?mode=firmware&tab=combos) | Firmware Mode のキー編集と Combo 一覧 |
| Combo を追加・編集する | [Combo 編集を開く](https://kobitokey-studio.pages.dev/?mode=firmware&tab=combos) | 中央下部の `Combos` |
| トラックボール感度を変更する | [Trackball 編集を開く](https://kobitokey-studio.pages.dev/?mode=firmware&tab=trackball) | 中央下部の `Trackball` |
| 変更内容を確認する | [Diff を開く](https://kobitokey-studio.pages.dev/?mode=firmware&tab=diff) | 中央下部の `Diff` |
| GitHub 連携で build / flash する | [Build & Flash を開く](https://kobitokey-studio.pages.dev/?mode=firmware&tab=build) | `Build & Flash` ボタンで開く GitHub wizard |
| キーだけ実機へ直接書く | [Direct Mode を開く](https://kobitokey-studio.pages.dev/?mode=direct) | Direct Mode の接続パネルと右側の `Key Config` |

## Firmware Mode の基本

Firmware Mode は keymap、Combo、Trackball、build、UF2 書き込みまでをファイルとして扱うモードです。迷ったら Firmware Mode を使ってください。

1. [Build & Flash](https://kobitokey-studio.pages.dev/?mode=firmware&tab=build) で GitHub に接続します。
2. `Firmware repository` と `Branch` を確認し、`GitHub から読み込み` を押します。
3. key、Combo、Trackball を編集します。
4. [Diff](https://kobitokey-studio.pages.dev/?mode=firmware&tab=diff) で変更内容を確認します。
5. 変更を破棄する場合は `編集をリセット` を押します。
6. 反映する場合は `Build & Flash` を押して、`Diff 確認済み`、`Commit & Build`、`Artifact 取得` の順に進みます。Build & Flash 画面では `編集に戻る` で編集タブへ戻れます。
7. left UF2、right UF2 の順に左右それぞれを bootloader に入れて書き込みます。

## Direct Mode の基本

Direct Mode は ZMK Studio 対応 firmware が入った実機に接続して、キー binding を素早く試すモードです。Combo と Trackball は参照のみです。

1. [Direct Mode](https://kobitokey-studio.pages.dev/?mode=direct) を開きます。
2. USB を推奨します。Bluetooth はブラウザから見える場合のみ使えます。
3. 実機を接続し、layer と key を選びます。
4. 右側の `Key Config` で binding を選び、`実機へ書き込み` を押します。

## 参照

- [Quick Start](./quick-start/)
- [使い方ガイド](./usage-guide/)
- [公開・リリース確認](./deployment/)
