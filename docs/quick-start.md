---
layout: page
title: Quick Start
permalink: /quick-start/
---

# Quick Start

このページは、KobitoKey Studio を初めて使う人が最短で起動し、最初の設定変更まで進むための手順です。詳しい説明やトラブルシューティングは [使い方ガイド](../usage-guide/) を参照してください。

## まず選ぶ

| 目的 | 選ぶもの |
| --- | --- |
| 初めて設定する、Combo やトラックボールも変更したい | `Firmware Mode` |
| キーを 1 個だけ実機へすぐ書き込みたい | `Direct Mode` |
| GitHub Actions build から UF2 書き込みまで進めたい | `Tauri デスクトップ版 + Firmware Mode` |

迷ったら `Firmware Mode` を使ってください。変更がファイルに残り、あとから diff で確認できます。

## 1. 起動する

KobitoKey Studio のリポジトリで依存関係を入れます。

```sh
npm install
```

Tauri デスクトップ版を起動します。実際の設定作業ではこちらを推奨します。

```sh
npm run tauri dev
```

ブラウザで UI を確認するだけなら、次でも起動できます。

```sh
npm run dev
```

ブラウザ版は `http://127.0.0.1:1420/` を開きます。ブラウザ版ではローカルファイルへ直接保存できないため、保存時はファイル download になります。

## 2. Firmware Mode で最初の変更をする

ファイルとして確実に設定を残す基本ルートです。

1. 上部の `Firmware` を選びます。
2. `KobitoKey_QWERTY` のローカルフォルダを指定します。
3. Firmware repository URL に `https://github.com/s-hiraoku/KobitoKey_QWERTY` のような GitHub URL を指定します。
4. `読み込み` を押します。
5. 左側で layer を選びます。
6. 中央のキーボード図で変更したい key を選びます。
7. 右側の `Binding` で新しい binding を選びます。
8. `反映` を押します。
9. `Diff` で変更内容を確認します。
10. `保存` を押します。

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

ZMK Studio 対応 firmware が入っている場合は、build せずに対応済み binding を実機へ保存できます。

1. 上部の `Direct` を選びます。
2. USB または Bluetooth で KobitoKey を接続します。
3. Tauri 版では `検出` → port 選択 → `読み込み` を押します。
4. ブラウザ版では Chrome/Edge で `Connect via USB` または `Connect via Bluetooth` を押します。
5. layer と key を選びます。
6. 右側の `Binding` で binding を選びます。
7. `実機へ書き込み` を押します。

Direct Mode で書いた変更は、ローカルの `KobitoKey_QWERTY` ファイルへ自動では戻りません。次回 build でも同じ状態を残したい場合は、Firmware Mode 側にも同じ設定を入れてください。

## 5. 最初に確認すること

| 症状 | 確認すること |
| --- | --- |
| project が読めない | `KobitoKey_QWERTY` の root を指定しているか |
| `保存` できない | Tauri デスクトップ版で開いているか |
| GitHub Actions が動かない | Firmware repository URL、`gh auth login`、repository 権限 |
| build に変更が入らない | ローカル保存後に `KobitoKey_QWERTY` 側で commit / push したか |
| artifact が古い | 最新 run の時刻と artifact 取得先を確認する |
| Direct Mode で device が出ない | USB data cable、ZMK Studio 対応 firmware、Chrome/Edge |
| UF2 volume が出ない | keyboard half が bootloader mode になっているか |

次に詳しく確認する場合は [使い方ガイド](../usage-guide/) の「目的別レシピ」と「トラブルシューティング」を見てください。
