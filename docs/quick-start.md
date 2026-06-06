---
layout: page
title: Quick Start
permalink: /quick-start/
---

# Quick Start

このページは、KobitoKey Studio を初めて使う人が最短で起動し、最初の設定変更まで進むための手順です。詳しい説明やトラブルシューティングは [使い方ガイド](../usage-guide/) を参照してください。
設定内容ごとにアプリを直接開く場合は [ユーザガイド](../user-guide/) を使ってください。

## 初版での機能差(重要)

ブラウザ版の公開 URL は <https://kobitokey-studio.s-hiraoku.workers.dev/> です。

| ビルド | Direct Mode | Firmware Mode |
| --- | --- | --- |
| ブラウザ版 (`npm run dev`) | ✅ 利用可 | ✅ GitHub 連携対応 |
| デスクトップ版 (`npm run tauri dev`) | ✅ 利用可 | ✅ 一部ユーザー向け |

ブラウザ版の Firmware Mode は GitHub 連携で利用できます。GitHub OAuth device flow または GitHub token を使って firmware repository を読み込み、commit、GitHub Actions build、artifact 取得、左右 UF2 の分類まで進めます。
Tauri デスクトップ版は一部ユーザー向けのローカル作業用です。公開版の手順はブラウザ版を基準にしてください。

スマホブラウザでは初版未対応画面を表示します。PC の Chrome / Edge で開いてください。

## まず選ぶ

| 目的 | 選ぶもの |
| --- | --- |
| キーを 1 個だけ実機へすぐ書き込みたい | `Direct Mode`(ブラウザ / デスクトップ) |
| Combo を書き込みたい | `Firmware Mode` |
| Trackball を調整したい | `Firmware Mode`。Direct Mode では参照のみ |
| keymap / overlay ファイルを編集して GitHub Actions build まで進めたい | `Firmware Mode` |

迷ったら、まずはブラウザの Direct Mode で 1 キーを書き換えてみてください。

## 1. 起動する

KobitoKey Studio のリポジトリで依存関係を入れます。

```sh
npm install
```

公開版を使う場合は、PC の Chrome / Edge で <https://kobitokey-studio.s-hiraoku.workers.dev/> を開きます。

開発中のブラウザ版を起動するには次のコマンドを実行し、Chrome / Edge で `http://127.0.0.1:1420/` を開きます。Direct Mode と Firmware Mode を試せます。

```sh
npm run dev
```

一部ユーザー向けにローカル clone を直接扱う従来の Firmware Mode を使う場合だけ、Tauri デスクトップ版を起動します。

```sh
npm run tauri dev
```

## 2. Firmware Mode で最初の変更をする

ファイルとして確実に設定を残す基本ルートです。公開版ではブラウザから GitHub repository を読み込み、commit、GitHub Actions build、artifact 取得まで進めます。

1. 上部の `Firmware` を選びます。
2. `Build & Flash` ボタンで GitHub repository URL と branch を指定し、GitHub に接続して `GitHub から読み込み` を押します。
3. `編集に戻る` で編集画面へ戻ります。
4. 左側で layer を選びます。
5. 中央のキーボード図で変更したい key を選びます。
6. 右側の動作エディタで新しいキー動作を選びます。
7. `選択キーに反映` を押します。
8. `Diff` で変更内容を確認します。
9. `Diff 確認済み` を押してから `Commit & Build` を押します。変更を破棄する場合は `編集をリセット` を押します。
10. build 成功後に artifact を取得し、left / right UF2 を順番に書き込みます。

Firmware Mode では layer 一覧の上にあるボタンで layer を追加・複製できます。削除は layer 番号参照のずれを避けるため、最後の layer だけ対応しています。キー動作や Combo の動作 / `layers` 指定から参照されている layer は削除できません。Direct Mode では実機の layer 構造変更は行いません。

よく使うキー動作例:

| やりたいこと | ZMK 構文 |
| --- | --- |
| `A` を入力する | `&kp A` |
| 押している間だけ layer 1 | `&mo 1` |
| tap で Space、hold で layer 1 | `&lt 1 SPACE` |
| 何もしない key | `&none` |
| 下の layer を透過 | `&trans` |

## 3. Firmware を反映する

保存しただけでは実機 firmware は変わりません。変更を反映するには build と UF2 書き込みが必要です。

ここでいう build は、KobitoKey Studio 自体の build ではなく、Firmware repository の GitHub Actions build です。KobitoKey Studio の画面では、ローカルフォルダとは別に Firmware repository URL を指定できます。

1. KobitoKey Studio の `Build & Flash` ボタンを押します。
2. GitHub OAuth device flow または token で接続します。device flow の新規タブが開かない場合は、画面上の `GitHub 認証を開く` リンクから認証を開きます。
3. `Commit & Build` を押します。
4. build 成功後、`Artifact 取得` を押します。
5. Studio が manifest または UF2 ファイル名から left / right を分類したことを確認します。
6. 左側を bootloader mode に入れて `Left reset を直接コピー` を押し、`INFO_UF2.TXT` がある bootloader volume を選びます。
7. reset 後に左側をもう一度 bootloader mode に入れ、同じボタンで `Left firmware を直接コピー` を実行します。
8. `Right` 側も `Right reset を直接コピー`、もう一度 bootloader mode、`Right firmware を直接コピー` の順に進めます。

ブラウザ版は Finder での手動コピーを通常ルートにしません。Chrome のフォルダ選択で `INFO_UF2.TXT` がある bootloader volume を選び、artifact 内の reset UF2 を先に直接コピーしてから、同じ side の firmware UF2 を直接コピーします。

ブラウザ版の `Commit & Build` は、Studio が扱う keymap / overlay だけを GitHub に commit してから GitHub Actions を起動します。

artifact に `manifest.json` または `firmware-manifest.json` がある場合、Studio は manifest を優先します。manifest がない場合、UF2 の自動分類はファイル名に `left` / `right` が含まれる前提です。分類できない場合、ブラウザ版は左右の書き込みボタンを有効化しません。Tauri 版は手動の UF2 / Bootloader 選択で確認しながらコピーできます。

## 4. Direct Mode でキーをすぐ書き込む

ZMK Studio 対応 firmware が入っている場合は、build せずに対応済みキー動作を実機へ保存できます。ブラウザ版・デスクトップ版どちらでも使えます。

1. 上部の `Direct` を選びます(ブラウザ版は最初から Direct です)。
2. まず USB data cable で KobitoKey を接続します。
3. 接続パネルの「接続方法」で `USB` を選び、`USB で接続` を押します。ブラウザのデバイス選択ダイアログが開くので、KobitoKey を選びます。
4. 接続後、ヘッダにデバイス名のチップ、保存状態、`再読み込み` / `切断` ボタンが表示されます。
5. layer と key を選びます。
6. 右側の `Key Config` で現在の動作と書き込み予定の動作を確認します。
7. `書き込み予定に追加`、`実機へ書き込み` の順に押します。

Direct Mode で書いた変更は、`KobitoKey_QWERTY` ファイルへ自動では戻りません。次回 build でも同じ状態を残したい場合は、Firmware Mode 側にも同じ設定を入れてください。

Bluetooth は実験的対応です。ZMK Studio 用として表示されるデバイスが見つかる場合だけ使えます。見つからない、または接続が不安定な場合は USB を使ってください。

## 5. 最初に確認すること

| 症状 | 確認すること |
| --- | --- |
| `Firmware` トグルが押せない | ブラウザ版では PC の Chrome / Edge で開いているか、ページを再読み込みしているかを確認してください |
| project が読めない | ブラウザ版は GitHub repository URL と branch、Tauri 版は `KobitoKey_QWERTY` の root を指定しているか |
| 「参照…」でダイアログが出ない | ブラウザは Chrome / Edge を使う、または `npm run tauri dev` でデスクトップ版を起動する |
| `保存` 時にダウンロードされる | フォルダのハンドルがない状態(`参照…` でフォルダを選び直すと直接保存に切り替わる) |
| GitHub Actions が動かない | Firmware repository URL、repository 権限、ブラウザ版は token/OAuth scope、Tauri 版は `gh auth login` |
| build に変更が入らない | ブラウザ版は `Commit & Build` 後の commit SHA、Tauri 版は保存後の commit / push を確認する |
| artifact が古い/取得できない | 最新 run の時刻、artifact 期限切れ、UF2 を含む artifact upload 設定を確認する |
| Direct Mode で device が出ない | USB data cable、ZMK Studio 対応 firmware、Chrome/Edge、`127.0.0.1` / `localhost` / HTTPS で開いているか。Bluetooth で見つからない場合は USB を使う |
| USB port を開けない | 他の KobitoKey Studio タブを閉じる、接続済み画面の `切断` を押す、USB を抜き差しする、Chrome を完全終了して再起動する |
| UF2 volume が出ない | keyboard half が bootloader mode になっているか。ブラウザ版は保存ダイアログで bootloader volume を選ぶ |

次に詳しく確認する場合は [使い方ガイド](../usage-guide/) の「目的別レシピ」と「トラブルシューティング」を見てください。
