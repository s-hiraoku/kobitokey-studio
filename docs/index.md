---
layout: home
title: KobitoKey Studio ガイド
permalink: /
---

# KobitoKey Studio ガイド

KobitoKey Studio は、KobitoKey のキーマップ、Combo、トラックボール設定、ファームウェアのビルド、UF2 書き込みをまとめて扱うための専用設定エディタです。

設定内容ごとの入口から始める場合は [ユーザガイド](./user-guide/) を開いてください。すぐに手順だけ見る場合は [Quick Start](./quick-start/)、背景や細かい設定まで確認する場合は [使い方ガイド](./usage-guide/) を参照してください。公開直前の確認は [公開チェックリスト](./release-checklist/)、詳細な deploy 設定は [Deployment](./deployment/) にまとめています。

ブラウザ版の公開 URL は <https://kobitokey-studio.s-hiraoku.workers.dev/> です。

## まず選ぶこと

最初に決めるのは「ファームウェアを作り直して反映する」か「実機へ直接書き込む」かです。

| 目的 | 選ぶモード | 反映方法 |
| --- | --- | --- |
| すべての設定を確実に変更したい | Firmware Mode | ファイル保存 → GitHub Actions でビルド → 左右 UF2 を書き込み |
| キーを少しだけ素早く変えたい | Direct Mode | USB 推奨。Bluetooth は見つかる場合のみ → 実機へ書き込み |
| Combo を変更したい | Firmware Mode | `KobitoKey.keymap` を編集 → build + flash |
| トラックボールを変更したい | Firmware Mode | 左右 overlay を編集 → build + flash。Direct Mode では参照のみ |

迷ったら `Firmware Mode` を使ってください。ファイルに残るため見直しやすく、Direct Mode 未対応の設定も扱えます。

スマホブラウザでは初版未対応画面を表示します。PC の Chrome / Edge で開いてください。

## 使い方の入口

- [設定内容ごとのアプリ入口を見る](./user-guide/)
- [Quick Start で最短手順を見る](./quick-start/)
- [最初の準備を確認する](./usage-guide/#1-事前準備)
- [モードの違いを確認する](./usage-guide/#2-モード選択の考え方)
- [作業前チェックリストを見る](./usage-guide/#作業前チェックリスト)
- [Firmware Mode で設定する](./usage-guide/#3-firmware-mode-で設定する)
- [ビルドして UF2 を書き込む](./usage-guide/#4-firmware-を-build-して-uf2-を書き込む)
- [Direct Mode で実機へ書き込む](./usage-guide/#5-direct-mode-で設定する)
- [公開直前チェックリストを見る](./release-checklist/)
- [公開とドキュメント更新手順を確認する](./deployment/)
- [目的別レシピを見る](./usage-guide/#6-目的別レシピ)
- [困ったときの確認項目を見る](./usage-guide/#7-トラブルシューティング)

## 最短ルート

### 初めて設定する

1. PC の Chrome / Edge でブラウザ版の公開 URL を開く
2. `Firmware` を選ぶ
3. `Build & Flash` から GitHub に接続し、repository と branch を指定して `GitHub から読み込み` を押す
4. keymap、Combo、Trackball を変更する
5. `Diff` を確認する
6. `Diff 確認済み`、`Commit & Build`、`Artifact 取得` の順に進める
7. 左右 UF2 を順番に bootloader へ書き込む

### キーを 1 個だけ試す

1. ZMK Studio 対応 firmware が入った KobitoKey を用意する
2. `Direct` を選ぶ
3. USB で接続する(Bluetooth は見つかる場合のみ)
4. layer と key を選ぶ
5. キー動作を選び、`書き込み予定に追加`、`実機へ書き込み` の順に押す

### Combo やトラックボールを確実に変える

1. `Firmware` を選ぶ
2. `Combos` または `Trackball` を開く
3. 変更する
4. `Diff` を確認する
5. ブラウザ版は `Commit & Build` で GitHub Actions build を起動し、UF2 書き込みで反映する

Tauri デスクトップ版は一部ユーザー向けのローカル作業用です。公開版の案内はブラウザ版を基準にしています。

## 設定別の早見表

| やりたいこと | 推奨モード | 保存先 |
| --- | --- | --- |
| キー配列をファイルとして編集する | Firmware Mode | `KobitoKey_QWERTY/config/KobitoKey.keymap` |
| Combo をファイルとして編集する | Firmware Mode | `KobitoKey.keymap` |
| トラックボール設定をファイルとして編集する | Firmware Mode | 左右 overlay ファイル |
| ファームウェアをビルドして UF2 を焼く | Firmware Mode | 左右の bootloader volume |
| 実機へキー動作を即時保存する | Direct Mode | ZMK Studio 対応 device |
| Combo を確認する | Direct Mode | Firmware keymap を参照表示 |
| トラックボール感度を確認する | Direct Mode | Firmware overlay を参照表示 |

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
2. USB で KobitoKey を接続する(Bluetooth は見つかる場合のみ)
3. 実機の keymap を読み込む
4. 対象 layer と key を選ぶ
5. キー動作を選ぶ
6. `書き込み予定に追加`、`実機へ書き込み` の順に押す

## よく使う用語

| 用語 | 意味 |
| --- | --- |
| keymap | layer ごとのキー動作と Combo を含む設定ファイル |
| layer | キーボードの面。`&mo` や `&lt` で一時的に切り替える |
| キー動作(ZMK 構文) | key に割り当てる動作。例: `&kp A`、`&lt 1 SPACE` |
| Combo | 複数 key の同時押しで別の動作を発火する設定 |
| overlay | トラックボールなど、左右 half ごとの hardware 寄り設定 |
| UF2 | bootloader volume にコピーして書き込む firmware ファイル |
| ZMK Studio | 実機に接続して対応済み設定を直接読み書きする仕組み |
