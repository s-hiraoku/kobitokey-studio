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
| ブラウザ版 (`npm run dev`) | ✅ 利用可 | 🧪 GitHub 連携 beta |
| デスクトップ版 (`npm run tauri dev`) | ✅ 利用可 | ✅ 利用可 |

ブラウザ版の Firmware Mode は GitHub 連携 beta です。GitHub OAuth device flow または GitHub token を使って firmware repository を読み込み、commit、GitHub Actions build、artifact 取得、左右 UF2 の分類まで進めます。

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

ブラウザで起動するには次のコマンドを実行し、Chrome / Edge で `http://127.0.0.1:1420/` を開きます。Direct Mode と Firmware Mode beta を試せます。

```sh
npm run dev
```

ローカル clone を直接扱う従来の Firmware Mode を使うには、Tauri デスクトップ版を起動します。

```sh
npm run tauri dev
```

## 2. Firmware Mode で最初の変更をする

ファイルとして確実に設定を残す基本ルートです。ブラウザ版は GitHub repository から読み込み、commit、GitHub Actions build、artifact 取得まで進めます。Tauri デスクトップ版はローカル clone と `gh` CLI を使います。

1. 上部の `Firmware` を選びます。
2. ブラウザ版では `Build & Flash` ボタンで GitHub repository URL と branch を指定し、GitHub に接続して `GitHub から読み込み` を押します。Tauri 版ではヘッダの「プロジェクトフォルダ」で `参照…` を押し、`KobitoKey_QWERTY` のローカルフォルダを選びます。
3. Tauri 版では `読み込み` を押します。
4. 左側で layer を選びます。
5. 中央のキーボード図で変更したい key を選びます。
6. 右側の動作エディタで新しいキー動作を選びます。
7. `選択キーに設定` を押します。
8. `Diff` で変更内容を確認します。
9. ブラウザ版では `Diff 確認済み` を押してから `Commit & Build` を押します。変更を破棄する場合は `編集をリセット` を押します。Tauri 版では `保存` を押します。
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
2. ブラウザ版では GitHub OAuth device flow または token で接続します。device flow の新規タブが開かない場合は、画面上の `GitHub 認証を開く` リンクから認証を開きます。Tauri 版では必要に応じて `接続確認` を押し、git / gh / workflow が OK になっていることを確認します。
3. ブラウザ版では `Commit & Build`、Tauri 版では `保存してBuild` を押します。
4. build 成功後、`Artifact 取得` を押します。
5. Studio が manifest または UF2 ファイル名から left / right を分類したことを確認します。
6. ブラウザ版では左側を bootloader mode に入れて `Left を書き込み` を押し、表示された bootloader volume に保存します。Tauri 版では `Left` を選び、左側を bootloader mode に入れて `UF2 / Volume 更新` を押します。
7. Tauri 版では `Left UF2 を bootloader にコピー` を押します。
8. `Right` 側も同じように進めます。

ブラウザで bootloader folder を直接選べない場合や、手動コピーのほうが確実な場合は、`Left UF2 をダウンロード` / `Right UF2 をダウンロード` を使います。download した UF2 を bootloader volume に手動コピーしてから同じ side の書き込みボタンをもう一度押すと、完了として記録して次の side へ進みます。

ブラウザ版の `Commit & Build` は、Studio が扱う keymap / overlay だけを GitHub に commit してから GitHub Actions を起動します。Tauri 版の `保存してBuild` は、ローカル保存、commit / push、GitHub Actions 起動をまとめて行います。

Tauri 版は `gh` CLI を使うため、初回は次を済ませてください。

```sh
gh auth login
```

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
