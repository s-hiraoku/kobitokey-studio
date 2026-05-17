---
layout: page
title: Quick Start
permalink: /quick-start/
---

# Quick Start

このページは、KobitoKey Studio を初めて使う人が最短で起動し、最初の設定変更まで進むための手順です。詳しい説明やトラブルシューティングは [使い方ガイド](../usage-guide/) を参照してください。

## 初版での機能差(重要)

ブラウザ版の公開 URL は <https://kobitokey-studio.pages.dev/> です。

| ビルド | Direct Mode | Firmware Mode |
| --- | --- | --- |
| ブラウザ版 (`npm run dev`) | ✅ 利用可 | ❌ 初版では無効化(`Firmware` トグルが disabled) |
| デスクトップ版 (`npm run tauri dev`) | ✅ 利用可 | ✅ 利用可 |

初版リリースのブラウザ版は **Direct Mode 専用** です。Combo の書き込みと Trackball 設定はデスクトップ版でのみ利用できます。

スマホブラウザでは初版未対応画面を表示します。PC の Chrome / Edge で開いてください。

## まず選ぶ

| 目的 | 選ぶもの |
| --- | --- |
| キーを 1 個だけ実機へすぐ書き込みたい | `Direct Mode`(ブラウザ / デスクトップ) |
| Combo を書き込みたい、Trackball を調整したい | `Direct Mode`(デスクトップ版のみ) |
| keymap / overlay ファイルを編集して GitHub Actions build まで進めたい | `Firmware Mode`(デスクトップ版のみ) |

迷ったら、まずはブラウザの Direct Mode で 1 キーを書き換えてみてください。

## 1. 起動する

KobitoKey Studio のリポジトリで依存関係を入れます。

```sh
npm install
```

ブラウザで起動するには次のコマンドを実行し、Chrome / Edge で `http://localhost:1420/` を開きます。初版のブラウザ版は Direct Mode 専用です。

```sh
npm run dev
```

Firmware Mode を含むフル機能を使うには、Tauri デスクトップ版を起動します。

```sh
npm run tauri dev
```

## 2. Firmware Mode で最初の変更をする(デスクトップ版のみ)

ファイルとして確実に設定を残す基本ルートです。**初版ではデスクトップ版のみで利用可能**で、ブラウザ版では `Firmware` トグルは disabled になります。

1. 上部の `Firmware` を選びます。
2. ヘッダの「プロジェクトフォルダ」で `参照…` を押し、`KobitoKey_QWERTY` のローカルフォルダを選びます。
3. `読み込み` を押します。
4. 左側で layer を選びます。
5. 中央のキーボード図で変更したい key を選びます。
6. 右側の `Binding` で新しい binding を選びます。
7. `反映` を押します。
8. `Diff` で変更内容を確認します。
9. `保存` を押します(ハンドルがあればフォルダに直接上書き、ない場合はダウンロード)。
10. GitHub Actions ビルドを起動するときは `Build & Flash` タブを開き、`Firmware repository URL` を入力した状態で `Build 起動` を押します。

よく使う binding 例:

| やりたいこと | binding |
| --- | --- |
| `A` を入力する | `&kp A` |
| 押している間だけ layer 1 | `&mo 1` |
| tap で Space、hold で layer 1 | `&lt 1 SPACE` |
| 何もしない key | `&none` |
| 下の layer を透過 | `&trans` |

## 3. Firmware を反映する

保存しただけでは実機 firmware は変わりません。変更を反映するには build と UF2 書き込みが必要です。

ここでいう build は、KobitoKey Studio 自体の build ではなく、Firmware repository の GitHub Actions build です。KobitoKey Studio の画面では、ローカルフォルダとは別に Firmware repository URL を指定できます。

1. `KobitoKey_QWERTY` 側で変更を commit / push します。
2. KobitoKey Studio の `GitHub Actions` または `Build` panel を開きます。
3. build を起動します。
4. build 成功後、artifact を取得します。
5. `UF2 / Volume 更新` を押します。
6. left 用 UF2 を左側 bootloader volume にコピーします。
7. right 用 UF2 を右側 bootloader volume にコピーします。

`gh` CLI を使うため、初回は次を済ませてください。

```sh
gh auth login
```

left / right の UF2 を取り違えないように、コピー前の確認 dialog でファイル名と volume を必ず確認します。

## 4. Direct Mode でキーをすぐ書き込む

ZMK Studio 対応 firmware が入っている場合は、build せずに対応済み binding を実機へ保存できます。ブラウザ版・デスクトップ版どちらでも使えます。

1. 上部の `Direct` を選びます(ブラウザ版は最初から Direct です)。
2. USB または Bluetooth で KobitoKey を接続します。
3. welcome card の「接続方法」select で `USB` か `Bluetooth` を選び、その横の Connect ボタンを押します。ブラウザのデバイス選択ダイアログが開くので、KobitoKey を選びます。
4. 接続後、ヘッダにデバイス名のチップと `再読み込み` / `切断` ボタンが表示されます。
5. layer と key を選びます。
6. 右側の `Binding` で binding を選びます。
7. `実機へ書き込み` を押します。

Direct Mode で書いた変更は、ローカルの `KobitoKey_QWERTY` ファイルへ自動では戻りません。次回 build でも同じ状態を残したい場合は、Firmware Mode(デスクトップ版)側にも同じ設定を入れてください。

## 5. 最初に確認すること

| 症状 | 確認すること |
| --- | --- |
| `Firmware` トグルが押せない | 初版のブラウザ版では Firmware Mode は無効化されています。`npm run tauri dev` でデスクトップ版を起動してください |
| project が読めない | `KobitoKey_QWERTY` の root を指定しているか(Firmware Mode はデスクトップ版のみ) |
| 「参照…」でダイアログが出ない | ブラウザは Chrome / Edge を使う、または `npm run tauri dev` でデスクトップ版を起動する |
| `保存` 時にダウンロードされる | フォルダのハンドルがない状態(`参照…` でフォルダを選び直すと直接保存に切り替わる) |
| GitHub Actions が動かない | Firmware repository URL、`gh auth login`、repository 権限(デスクトップ版のみ) |
| build に変更が入らない | ローカル保存後に `KobitoKey_QWERTY` 側で commit / push したか |
| artifact が古い | 最新 run の時刻と artifact 取得先を確認する |
| Direct Mode で device が出ない | USB data cable、ZMK Studio 対応 firmware、Chrome/Edge、`localhost` または HTTPS で開いているか |
| UF2 volume が出ない | keyboard half が bootloader mode になっているか(デスクトップ版のみ) |

次に詳しく確認する場合は [使い方ガイド](../usage-guide/) の「目的別レシピ」と「トラブルシューティング」を見てください。
