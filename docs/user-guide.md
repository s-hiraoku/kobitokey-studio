---
layout: page
title: ユーザガイド
permalink: /user-guide/
---

# ユーザガイド

KobitoKey Studio は PC の Chrome / Edge で使う KobitoKey 専用の設定ツールです。公開版ではブラウザ版を基準に案内します。Tauri デスクトップ版は、ローカル clone や `gh` CLI を使う一部ユーザー向けです。

公開版: <https://kobitokey-studio.s-hiraoku.workers.dev/>

## 目的別に開く

| 目的 | アプリを開く | 使う画面 |
| --- | --- | --- |
| keymap を編集する | [Firmware Mode を開く](https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware) | Firmware Mode のキー編集 |
| Combo を追加・編集する | [Combo 編集を開く](https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=combos) | 中央下部の `Combos` |
| トラックボール感度を変更する | [Trackball 編集を開く](https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=trackball) | 中央下部の `Trackball` |
| 変更内容を確認する | [Diff を開く](https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=diff) | 中央下部の `Diff` |
| GitHub 連携で build / flash する | [Build & Flash を開く](https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=build) | `Build & Flash` |
| キーだけ実機へ直接書く | [Direct Mode を開く](https://kobitokey-studio.s-hiraoku.workers.dev/?mode=direct) | Direct Mode の接続パネルと `Key Config` |

スマホブラウザは初版未対応です。PC の Chrome / Edge で開いてください。

## まず選ぶ

| やりたいこと | 選ぶモード | 理由 |
| --- | --- | --- |
| キー、Combo、Trackball をファイルとして残したい | Firmware Mode | `KobitoKey_QWERTY` に commit して build できる |
| Combo を追加・変更したい | Firmware Mode | Direct Mode では Combo は参照のみ |
| トラックボール設定を変更したい | Firmware Mode | Direct Mode では Trackball は参照のみ |
| キーを 1 個だけすぐ試したい | Direct Mode | ZMK Studio 対応 firmware に USB で直接保存できる |

迷ったら Firmware Mode を使います。ファイルに設定が残り、GitHub Actions build と UF2 書き込みまで同じ画面で進められます。

## Firmware Mode の基本

Firmware Mode は `KobitoKey_QWERTY` の次の3ファイルを編集します。

| 種類 | 対象ファイル |
| --- | --- |
| キー / Combo | `config/KobitoKey.keymap` |
| 左側 Trackball | `config/boards/shields/KobitoKey/KobitoKey_left.overlay` |
| 右側 Trackball | `config/boards/shields/KobitoKey/KobitoKey_right.overlay` |

ブラウザ版ではローカル clone は不要です。GitHub repository を読み込み、変更を commit し、GitHub Actions の `build.yml` を起動して artifact を取得します。公式 repository に書き込み権限がない場合は、自分の fork を `Firmware repository` に指定してください。

### GitHub から読み込む

1. [Build & Flash](https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=build) を開きます。
2. `Firmware repository` に `owner/repo` または GitHub URL を入力します。
3. `Branch` を確認します。branch が空だと読み込み、commit、build は進めません。
4. `GitHub で接続` または `GitHub token` で接続します。
5. `GitHub から読み込み` を押します。
6. 読み込み後、`編集に戻る` で編集画面へ戻ります。

OAuth device flow のタブが開かない場合は、画面に表示される `GitHub 認証を開く` リンクから認証してください。token はメモリ上だけで使われます。fine-grained token を使う場合は、対象 repository に Contents write と Actions write を付けます。

### キーを編集する

1. 左側の layer 一覧から編集する layer を選びます。
2. 中央のキーボード図で key を選びます。
3. 右側のエディタでキー動作を選びます。
4. `選択キーに反映` を押します。
5. 必要なら layer 一覧上の `+` で layer 追加、copy で layer 複製をします。

layer 削除は最後の layer だけ対応しています。キー動作や Combo から参照されている layer は削除できません。

よく使うキー動作:

| やりたいこと | ZMK 構文 |
| --- | --- |
| `A` を入力する | `&kp A` |
| 押している間だけ layer 1 | `&mo 1` |
| tap で Space、hold で layer 1 | `&lt 1 SPACE` |
| 何もしない | `&none` |
| 下の layer を透過する | `&trans` |

### Combo を編集する

1. `Combos` を開きます。
2. 既存 Combo を選ぶか、`追加` を押します。
3. Combo 成立時の動作を選びます。
4. key grid で同時押しする key position を2つ以上選びます。
5. 必要なら `layers` と `timeoutMs` を調整します。
6. `Combo の編集を保存` を押します。

Combo は Direct Mode では参照のみです。追加や変更は Firmware Mode で行い、build + flash で反映します。

### Trackball を編集する

1. `Trackball` を開きます。
2. CPI、pointer 感度、scroll 感度、gesture threshold などを確認します。
3. 変更したい値を入力します。
4. `トラックボール編集を保存` を押します。

Trackball は左右 overlay に保存されます。一度に大きく変えると原因を切り分けにくいため、まずは1項目ずつ変更して build + flash 後に確認してください。

### Diff を確認する

1. `Diff` を開きます。
2. `KobitoKey.keymap`、left overlay、right overlay の変更を確認します。
3. 問題なければ `Build & Flash` で `Diff 確認済み` を押します。
4. 変更を破棄する場合は `編集をリセット` を押します。

ブラウザ版では `Commit & Build` を押すまで GitHub repository は更新されません。

## Build & Flash

Firmware Mode の `Build & Flash` は、編集から書き込みまでを1本で進めるだけでなく、途中から再開する用途にも使えます。

| 状況 | 使う操作 | できること |
| --- | --- | --- |
| KobitoKey Studio で編集して、build から書き込みまで進める | `GitHub から読み込み` → 編集 → `Diff 確認済み` → `Commit & Build` → `Artifact 取得` | repository に変更を残し、対象 commit の artifact を取得して書き込む |
| すでに GitHub Actions artifact まで作成済み | GitHub に接続し、repository / branch / run を確認して `Artifact 取得` | 画面上の commit / run に紐づく artifact を再取得して書き込む |
| GitHub 以外で取得した artifact を使う | `Artifact フォルダから再開` または `フォルダを選択` | 展開済み artifact フォルダ内の UF2 を読み込み、Flash だけ進める |
| UF2 ファイルだけ手元にある | UF2 を1つのフォルダにまとめて `Artifact フォルダから再開` | フォルダ内の left / reset / right UF2 を分類して書き込む |

どの入口でも、ブラウザ版の書き込みは `reset UF2 → firmware UF2` の順です。Direct Mode / ZMK Studio の保存設定が残っている場合でも、reset UF2 を先に入れることで firmware keymap が反映されやすくなります。

### Commit と build

1. `Diff 確認済み` を押します。
2. `Commit & Build` を押します。
3. 画面に commit SHA が出たことを確認します。
4. build が成功したら `Artifact 取得` を押します。

`Commit & Build` は Studio が扱う keymap / overlay の3ファイルだけを1 commit にまとめ、同じ branch の `build.yml` を起動します。commit はできたが workflow 起動だけ失敗した場合は、同じ画面の `Build 起動` で再試行できます。

編集をすべて Studio から行う場合は、このルートを使います。`Artifact 取得` は表示中 commit と一致する成功 run を確認してから artifact を読むため、古い build の UF2 を間違って使いにくくなっています。

### Artifact を確認する

`Artifact 取得` 後、Flash パネルに left / reset / right の3種類が揃っているか確認します。

| 必要な UF2 | 役割 |
| --- | --- |
| left UF2 | 左側 half の firmware |
| reset UF2 | Direct Mode / ZMK Studio の保存設定を消す |
| right UF2 | 右側 half の firmware |

artifact に `manifest.json` または `firmware-manifest.json` がある場合、Studio は manifest の `left` / `right` / `reset` または `outputs[].side` / `outputs[].file` を優先します。manifest がない場合は UF2 ファイル名から推定します。left / reset / right が揃わない場合、書き込みボタンは有効になりません。

### Artifact から再開する

GitHub 以外で取得した artifact や、以前ダウンロードした artifact から書き込む場合は `Artifact フォルダから再開` または Flash パネル内の `フォルダを選択` を使います。

1. GitHub Actions などから artifact zip を取得している場合は、先に展開します。
2. 展開したフォルダ、または left / reset / right UF2 をまとめたフォルダを選びます。
3. Studio がフォルダ内を読み込み、left / reset / right を分類します。
4. Flash パネルの表示が `left OK / reset OK / right OK` になったことを確認します。
5. [UF2 を書き込む](#uf2-を書き込む) の手順で左右にコピーします。

artifact フォルダから再開する場合、GitHub token、repository、branch、commit、run の再接続は不要です。Flash だけをやり直したいとき、別のPCで取得した artifact を書き込みたいとき、GitHub Actions 画面から手動ダウンロードした artifact を使うときに便利です。

注意点:

- ブラウザ版は zip ファイルを直接選ぶのではなく、展開済みフォルダを選びます。
- フォルダ内のサブフォルダも読めます。
- フォルダ再開では UF2 ファイル名から分類します。`left`、`right`、`reset` または `settingsreset` が分かる名前にしてください。
- left / reset / right のどれかが欠けると、書き込みボタンは有効になりません。
- manifest にしか side 情報がない artifact は、GitHub run から `Artifact 取得` するルートを使うほうが確実です。

### UF2 を書き込む

ブラウザ版は Chrome のフォルダ選択で bootloader volume を選び、UF2 を直接コピーします。Finder での手動コピーは通常ルートではありません。

1. 左側を USB で接続し、bootloader mode に入れます。
2. `Left reset を直接コピー` を押します。
3. `INFO_UF2.TXT` がある left 側の bootloader volume を選びます。
4. reset 後、左側をもう一度 bootloader mode に入れます。
5. 同じボタンが `Left firmware を直接コピー` に変わるので、left 側の bootloader volume を選びます。
6. 右側へ USB を差し替え、bootloader mode に入れます。
7. `Right reset を直接コピー` を押して right 側の bootloader volume を選びます。
8. reset 後、右側をもう一度 bootloader mode に入れます。
9. `Right firmware を直接コピー` を押して完了します。

Direct Mode / ZMK Studio で保存した runtime keymap は ZMK の永続設定に残り、通常 firmware を flash しても `.keymap` の変更より優先されることがあります。そのため、ブラウザ版 Firmware Mode では reset UF2 を先に書き込んでから、同じ側の firmware UF2 を書き込みます。

コピー先を選ぶ前に、接続中の half とボタンの Left / Right が合っていること、選んだ volume に `INFO_UF2.TXT` があること、表示されている artifact 名 / id が対象 build と合っていることを確認してください。

## Direct Mode の基本

Direct Mode は ZMK Studio 対応 firmware が入った KobitoKey に接続して、対応済みのキー動作を実機へ直接保存するモードです。USB を推奨します。Bluetooth は ZMK Studio 用 device として表示される場合だけ使えます。

1. [Direct Mode](https://kobitokey-studio.s-hiraoku.workers.dev/?mode=direct) を開きます。
2. USB data cable で KobitoKey を接続します。
3. 接続方法で `USB` を選び、`USB で接続` を押します。
4. ブラウザの device picker で KobitoKey を選びます。
5. layer と key を選びます。
6. 右側の `Key Config` でキー動作を選びます。
7. `書き込み予定に追加`、`実機へ書き込み` の順に押します。

書き込み後は device から keymap が再読み込みされます。Combo と Trackball は Direct Mode では参照のみです。Direct Mode で書いた変更は `KobitoKey_QWERTY` のファイルへ自動では戻らないため、次回 build でも残したい場合は Firmware Mode の keymap にも反映してください。

Direct Mode が読み込んだ実機 keymap と Firmware Mode の keymap に差分がある場合、Direct summary からキー差分を Firmware keymap に取り込めます。保存または commit は Firmware Mode 側で実行します。

## 困ったとき

| 症状 | 確認すること |
| --- | --- |
| `Firmware` が使えない | PC の Chrome / Edge で開いているか。スマホブラウザは未対応です |
| GitHub から読み込めない | repository URL、branch、OAuth/token の権限、private repository へのアクセス権 |
| `Commit & Build` が押せない | GitHub 接続、repository / branch、読み込み済み files、変更、`Diff 確認済み` |
| `Artifact 取得` が押せない | 対象 commit の GitHub Actions build が成功しているか |
| 書き込みボタンが押せない | left / reset / right UF2 がすべて揃っているか |
| bootloader volume が選べない | half が bootloader mode になっているか、`INFO_UF2.TXT` がある volume を選んでいるか |
| Direct Mode で device が出ない | USB data cable、ZMK Studio 対応 firmware、Chrome/Edge、HTTPS または localhost |
| Direct 書き込みが反映されない | layer / key position、対応キー動作、接続中の half、書き込み後の再読み込み結果 |

詳しい説明は [使い方ガイド](../usage-guide/)、最短手順だけ確認したい場合は [Quick Start](../quick-start/) を参照してください。
