---
layout: home
title: KobitoKey Studio ガイド
permalink: /
---

# KobitoKey Studio ガイド

KobitoKey Studio は、KobitoKey のキーマップ、Combo、トラックボール設定、ファームウェアのビルド、UF2 書き込みをまとめて扱うための専用設定エディタです。

まずは [使い方ガイド](./usage-guide/) を開いてください。どのモードを使うべきか、どこを押せばよいか、設定後にどう保存・反映するかを順番に確認できます。

## まず選ぶこと

最初に決めるのは「ファームウェアを作り直して反映する」か「実機へ直接書き込む」かです。

| 目的 | 選ぶモード | 反映方法 |
| --- | --- | --- |
| すべての設定を確実に変更したい | Firmware Mode | ファイル保存 → GitHub Actions でビルド → 左右 UF2 を書き込み |
| キーを少しだけ素早く変えたい | Direct Mode | USB/Bluetooth で接続 → 実機へ書き込み |
| Combo やトラックボールも実機へ直接保存したい | Direct Mode + Tauri版 | Tauri デスクトップ版で読み込み → 保存 |

迷ったら `Firmware Mode` を使ってください。ファイルに残るため見直しやすく、Direct Mode 未対応の設定も扱えます。

## 使い方の入口

- [最初の準備を確認する](./usage-guide/#1-事前準備)
- [モードの違いを確認する](./usage-guide/#2-モード選択の考え方)
- [Firmware Mode で設定する](./usage-guide/#3-firmware-mode-で設定する)
- [ビルドして UF2 を書き込む](./usage-guide/#4-firmware-を-build-して-uf2-を書き込む)
- [Direct Mode で実機へ書き込む](./usage-guide/#5-direct-mode-で設定する)
- [困ったときの確認項目を見る](./usage-guide/#7-トラブルシューティング)

## 設定別の早見表

| やりたいこと | 推奨モード | 保存先 |
| --- | --- | --- |
| キー配列をファイルとして編集する | Firmware Mode | `KobitoKey_QWERTY/config/KobitoKey.keymap` |
| Combo をファイルとして編集する | Firmware Mode | `KobitoKey.keymap` |
| トラックボール設定をファイルとして編集する | Firmware Mode | 左右 overlay ファイル |
| ファームウェアをビルドして UF2 を焼く | Firmware Mode | 左右の bootloader volume |
| 実機へキー binding を即時保存する | Direct Mode | ZMK Studio 対応 device |
| 実機の Combo を直接編集する | Direct Mode + Tauri | ZMK Studio 対応 device |
| 実機のトラックボール感度を直接編集する | Direct Mode + Tauri | ZMK Studio 対応 device |

## 作業の全体像

### ファイル編集で確実に反映する流れ

1. `Firmware` を選ぶ
2. `KobitoKey_QWERTY` フォルダを読み込む
3. キー、Combo、トラックボール設定を編集する
4. `Diff` で変更内容を確認する
5. `保存` する
6. GitHub Actions でビルドする
7. 左右の UF2 をそれぞれ bootloader にコピーする

### 実機へすぐ反映する流れ

1. `Direct` を選ぶ
2. USB または Bluetooth で KobitoKey を接続する
3. 実機の keymap を読み込む
4. 対象 layer と key を選ぶ
5. binding を選ぶ
6. `実機へ書き込み` を押す
