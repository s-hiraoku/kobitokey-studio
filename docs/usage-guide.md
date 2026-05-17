---
layout: page
title: KobitoKey Studio 使い方ガイド
permalink: /usage-guide/
---

# KobitoKey Studio 使い方ガイド

このガイドのゴールは、ユーザが自分で KobitoKey Studio を起動し、目的に合うモードを選び、キーマップ、Combo、トラックボール設定、Firmware build、UF2 書き込みまで進められるようにすることです。

## 初版でできること(重要)

初版リリースでは、ブラウザ版とデスクトップ版で使える機能が大きく違います。

| ビルド | Direct Mode (キー) | Direct Mode (Combo / Trackball) | Firmware Mode |
| --- | --- | --- | --- |
| ブラウザ版 (`npm run dev`) | ✅ 利用可 | 読み取りのみ / 未対応 | ❌ **初版では無効化** |
| デスクトップ版 (`npm run tauri dev`) | ✅ 利用可 | ✅ 書き込み可 | ✅ 利用可 |

- 初版のブラウザ版は **Direct Mode 専用** です。ヘッダの `Firmware` トグルは disabled になっています。
- Firmware モードのファイル編集、GitHub Actions ビルド、UF2 書き込み補助はすべてデスクトップ版でのみ利用できます。
- 初版以降に Firmware モードのブラウザ対応(リポジトリへの書き戻しなど)を順次検討します。

## まず結論

KobitoKey Studio では、最初に `Firmware Mode`(デスクトップ版のみ)と `Direct Mode` のどちらを使うかを選びます。

| 迷っている内容 | 選ぶもの | 理由 |
| --- | --- | --- |
| キーを 1 個だけ素早く変更したい | Direct Mode | ビルドと UF2 書き込みなしで実機へ保存できるため |
| ブラウザだけで試したい | Direct Mode (Chrome/Edge) | 初版のブラウザ版は Direct Mode 専用 |
| Combo やトラックボールを確実に設定したい | デスクトップ版 + Direct Mode または Firmware Mode | ブラウザ版 Direct ではどちらも書き込めない |
| 設定をファイルとして残したい / GitHub Actions ビルドまで進めたい | デスクトップ版 + Firmware Mode | ローカル保存、artifact 取得、UF2 コピーが必要なため |

Firmware Mode は `KobitoKey_QWERTY` の設定ファイルを編集し、ファームウェアを作り直して反映します。Direct Mode は、ZMK Studio 対応 firmware が入った実機へ、対応済みの設定だけを直接保存するための高速な編集モードです。

## このガイドの読み方

最短で設定したい場合は、次の順番で読んでください。

1. [事前準備](#1-事前準備)
2. [モード選択の考え方](#2-モード選択の考え方)
3. ファイル編集で反映するなら [Firmware Mode で設定する](#3-firmware-mode-で設定する)
4. 実機へ直接反映するなら [Direct Mode で設定する](#5-direct-mode-で設定する)
5. 書き込みで迷ったら [トラブルシューティング](#7-トラブルシューティング)

## 作業前チェックリスト

設定を始める前に、次を確認してください。ここで条件が揃っていないと、途中で保存、ビルド、書き込みのどこかで止まります。

| 確認すること | Firmware Mode | Direct Mode |
| --- | --- | --- |
| KobitoKey Studio を起動できる | 必須 | 必須 |
| `KobitoKey_QWERTY` のローカル clone がある | 必須 | 任意 |
| `config/KobitoKey.keymap` が読める | 必須 | 任意 |
| 左右 overlay ファイルが読める | Trackball 編集に必須 | 任意 |
| `gh auth login` 済み | GitHub Actions を使う場合に必須 | 不要 |
| ZMK Studio 対応 firmware が入っている | 不要 | 必須 |
| USB data 通信できるケーブルがある | UF2 書き込みに必須 | USB Direct に必須 |
| Chrome または Edge を使っている | ブラウザ版では推奨 | ブラウザ Direct では必須 |

Tauri デスクトップ版で作業する場合は、Firmware Mode のローカルファイル保存、GitHub Actions 操作、artifact download、UF2 コピーまで一つの画面で進められます。初版のブラウザ版は Direct Mode 専用で、Firmware Mode のトグルは disabled になっています。

## 画面の見方

KobitoKey Studio の画面は、主に 4 つの領域に分かれています。

| 場所 | 役割 |
| --- | --- |
| 上部バー | `Firmware` / `Direct` の切り替え、プロジェクト読み込み、接続状態 |
| 左側 | layer 一覧 |
| 中央 | 実際の KobitoKey 形状に沿った keymap 表示、Combo overlay、作業 tabs |
| 右側 | 選択中 key の binding、Combo、Trackball、Build/Flash 操作 |

基本操作は「左で layer を選ぶ → 中央で key を選ぶ → 右で設定する」です。

### よく使うボタン

| ボタン | ある場所 | 何をするか |
| --- | --- | --- |
| `参照…` | Firmware Mode 上部 | `KobitoKey_QWERTY` フォルダを picker で選ぶ(ブラウザ・デスクトップ両対応) |
| `読み込み` | Firmware Mode 上部 | 指定した project から keymap と overlay を読む |
| Firmware repository URL | `Build & Flash` タブ | GitHub Actions を実行する firmware repository を指定する |
| `保存` | Firmware Mode 中央上部 | 編集した keymap / overlay をローカルへ保存する(ハンドルがあればフォルダに直接上書き、なければダウンロード) |
| 接続方法 select + Connect ボタン | Direct welcome card | USB か Bluetooth を選んでブラウザのデバイス選択ダイアログを開く |
| `再読み込み` | Direct Mode 上部 (接続済み) | 実機から keymap などを再取得する |
| `切断` | Direct Mode 上部 (接続済み) | 実機との接続を切る |
| `実機へ書き込み` | Direct Mode 右側 | 選択中 key の binding を実機へ保存する |
| `UF2 / Volume 更新` | Firmware Mode Build/Flash | artifact と bootloader volume を再スキャンする(デスクトップ版のみ) |

## モード早見表

KobitoKey Studio には大きく分けて 2 つのモードがあります。

| モード | 使う場面 | 設定の反映方法 |
| --- | --- | --- |
| Firmware Mode | `KobitoKey_QWERTY` の設定ファイルを編集し、Firmware を作り直す | GitHub Actions で build し、左右の UF2 を bootloader にコピーする |
| Direct Mode | ZMK Studio 対応 firmware が入った実機へ、対応済み設定を直接書き込む | USB または Bluetooth で接続し、実機の不揮発設定へ保存する |

## 作業フロー早見表

### Firmware Mode の基本フロー

1. `Firmware` を選ぶ
2. `KobitoKey_QWERTY` フォルダを読み込む
3. layer と key を選んで binding を変更する
4. 必要なら Combo やトラックボールも変更する
5. `Diff` で変更内容を確認する
6. `保存` する
7. GitHub Actions でビルドする
8. left / right の UF2 をそれぞれ bootloader にコピーする

### Direct Mode の基本フロー

1. `Direct` を選ぶ
2. USB または Bluetooth で KobitoKey を接続する
3. 実機 keymap を読み込む
4. layer と key を選ぶ
5. binding を選ぶ
6. `実機へ書き込み` を押す
7. 書き込み後に再読み込みされた表示を確認する

Direct Mode で Combo やトラックボールを書き込む場合は、Tauri デスクトップ版を使ってください。ブラウザ版では読み取り表示または未対応になる項目があります。

## 1. 事前準備

### 必要なもの

- KobitoKey 本体
- `KobitoKey_QWERTY` リポジトリのローカル clone
- KobitoKey Studio
- GitHub Actions を使う場合は GitHub に push 済みの `KobitoKey_QWERTY` リポジトリ
- Tauri デスクトップ版で GitHub Actions を操作する場合は `gh` CLI
- Direct Mode を使う場合は ZMK Studio 対応 firmware

### どの起動方法を選ぶか

| 起動方法 | 向いている用途 |
| --- | --- |
| Tauri デスクトップ版 | 実際の設定作業、Firmware Mode のファイル編集、ビルド、artifact 取得、UF2 コピー、Direct の Combo / Trackball 書き込み |
| ブラウザ版(初版) | Direct Mode の試用と key binding の書き込み (Web Serial / Web Bluetooth) |

設定作業を最後まで進めるなら、Tauri デスクトップ版を推奨します。**初版のブラウザ版は Direct Mode 専用** で、Firmware Mode、GitHub Actions、UF2 コピーは使えません。

### ローカル開発版の起動

ブラウザで Direct Mode を試すなら、KobitoKey Studio のリポジトリで次を実行します。

```sh
npm install
npm run dev
```

起動後、Chrome または Edge で `http://localhost:1420/` を開きます。初版のブラウザ版は Direct Mode 専用です(`Firmware` トグルは disabled)。

Firmware Mode を含むフル機能を使うには、Rust と Cargo を用意したうえで Tauri デスクトップ版を起動します。

```sh
npm run tauri dev
```

Tauri デスクトップ版では、ローカルファイルの読み書き、GitHub Actions 操作、artifact download、UF2 コピー、Direct Combo/Trackball 書き込みなど、ブラウザでは制限される機能をすべて使えます。

### GitHub CLI の準備

Firmware Mode の GitHub Actions build 操作は、Tauri backend から `gh` CLI を呼び出します。初回は次で認証してください。

```sh
gh auth login
```

認証後、`KobitoKey_QWERTY` リポジトリで GitHub Actions の `build.yml` workflow を実行できる権限が必要です。

## 2. モード選択の考え方

### Firmware Mode を選ぶ場合

Firmware Mode は、次の設定をファイルとして編集します。

- `config/KobitoKey.keymap`
- `config/boards/shields/KobitoKey/KobitoKey_left.overlay`
- `config/boards/shields/KobitoKey/KobitoKey_right.overlay`

編集後は保存し、GitHub Actions で firmware を build し、生成された左右の UF2 をそれぞれの bootloader volume にコピーします。設定が firmware に焼き込まれるため、Direct Mode が未対応の binding や overlay 設定も扱えます。

### Direct Mode を選ぶ場合

Direct Mode は、ZMK Studio API を使って実機へ直接設定を書き込みます。build と UF2 書き込みを待たずに反映できる点が利点です。

ただし、Direct Mode で扱える設定は firmware 側の Studio RPC と KobitoKey Studio 側の実装に依存します。未対応の設定は Firmware Mode で編集し、build + flash してください。

### Tauri デスクトップ版とブラウザ版の違い

| 機能 | Tauri デスクトップ版 | ブラウザ版 (初版) |
| --- | --- | --- |
| Firmware Mode (トグル) | 利用可 | **無効化** |
| Firmware ファイル読み込み | ローカルフォルダから読み込み | — |
| Firmware ファイル保存 | ローカルファイルへ直接保存 | — |
| GitHub Actions build | 対応 | — |
| Artifact download | 対応 | — |
| UF2 bootloader copy | 対応 | — |
| Direct USB | 対応 | Chrome/Edge の Web Serial で対応 |
| Direct Bluetooth | 対応環境で利用 | Chrome/Edge の Web Bluetooth で対応 |
| Direct key binding write | 対応 | 対応 |
| Direct Combo write | 対応 | 読み取り表示または未対応 |
| Direct Trackball write | 対応 | 未対応表示 |

ブラウザ版で Direct Mode を使う場合は、Chrome または Edge で `localhost` または HTTPS から開いてください。Web Serial / Web Bluetooth は、通常の `file://` や安全でない HTTP では利用できません。

### 保存先と反映先の違い

設定の種類ごとに、保存される場所と反映方法が違います。

| 設定 | Firmware Mode の保存先 | Firmware Mode の反映 | Direct Mode の保存先 | Direct Mode の反映 |
| --- | --- | --- | --- | --- |
| key binding | `KobitoKey.keymap` | build + UF2 書き込み | 実機の Studio 設定 | 書き込み直後 |
| Combo | `KobitoKey.keymap` | build + UF2 書き込み | 実機の Studio 設定 | Tauri 版で書き込み直後 |
| Trackball | 左右 overlay | build + UF2 書き込み | 実機の Studio 設定 | Tauri 版で書き込み直後 |
| Timing | 該当 firmware 設定ファイル | build + UF2 書き込み | 現在は保存対象外 | 未対応 |
| GitHub Actions build | なし | UF2 artifact を生成 | なし | 対象外 |

Firmware Mode は「ファイルを更新してから firmware に焼き込む」流れです。Direct Mode は「接続中の実機へその場で保存する」流れです。どちらで変更したか分からなくなった場合は、最終的に反映したい状態を Firmware Mode のファイルへ残しておくと管理しやすくなります。

## 3. Firmware Mode で設定する(デスクトップ版のみ)

> 初版のブラウザ版では `Firmware` トグルが disabled になっており、本セクションの手順は実行できません。`npm run tauri dev` でデスクトップ版を起動してください。

### 3.1 プロジェクトを読み込む

1. 上部のモード切り替えで `Firmware` を選びます。
2. ヘッダの「プロジェクトフォルダ」入力欄の隣にある `参照…` を押し、`KobitoKey_QWERTY` のローカルフォルダを選びます。
3. `読み込み` を押します。
4. (任意)ビルドまで進める場合は `Build & Flash` タブを開き、`Firmware repository URL` に GitHub の repository URL を指定します。

デフォルトの想定パスは次です。

```txt
/Volumes/SSD/ghq/github.com/s-hiraoku/KobitoKey_QWERTY
```

読み込みに成功すると、左側に layer 一覧、中央に KobitoKey の物理レイアウト、右側に選択中キーの編集 panel が表示されます。

読み込み後に最初に見る場所は、左側の layer 一覧です。layer を切り替えると中央の key 表示が変わります。中央の key をクリックすると、右側の inspector がその key の編集画面になります。

ローカルフォルダは keymap / overlay の読み書きに使います。Firmware repository URL は `Build & Flash` タブにあり、GitHub Actions の build 起動、最新 run 確認、artifact 取得に使います。通常は同じ repository を指しますが、fork の Actions を使いたい場合は fork 側の URL を指定できます。

### 3.2 キー binding を編集する

1. 左側の layer 一覧から編集したい layer を選びます。
2. 中央のキーボード図で変更したい key をクリックします。
3. 右側の `Binding` panel で binding type を選びます。
4. on-screen picker から keycode、layer、modifier、mouse button、Bluetooth action などを選びます。
5. `反映` を押します。
6. 中央の表示と右側の preview が変わったことを確認します。

Firmware Mode の編集は、押した時点ではまだローカルファイルへ保存されません。画面上の変更を確認してから `保存` を押してください。

変更後は、対象 key の表示と右側の preview が意図した binding になっているか確認します。複雑な binding は label が短縮表示されることがありますが、tooltip や inspector では full binding を確認できます。

### 3.3 Binding picker の使い分け

| 種類 | 使う binding | 入力内容 |
| --- | --- | --- |
| 通常キー | `&kp KEY` | 文字、数字、記号、navigation、function、media/system key |
| Layer Tap | `&lt LAYER KEY` | tap 時の key と hold 時の layer |
| Mod Tap | `&mt MOD KEY` | hold 時の modifier と tap 時の key |
| Momentary Layer | `&mo LAYER` | 押している間だけ有効にする layer |
| To Layer | `&to LAYER` | 移動先 layer |
| Mouse Button | `&mkp VALUE` | mouse button |
| Bluetooth | `&bt COMMAND VALUE` | profile 選択や clear など |
| Raw | 任意の ZMK binding | picker 未対応の binding を直接入力 |

Raw は、KobitoKey Studio がまだ構造化 UI を持たない binding を扱うための逃げ道です。ZMK の構文を理解している場合だけ使ってください。

### 3.4 よく使う binding 例

| やりたいこと | binding 例 | 補足 |
| --- | --- | --- |
| `A` を入力する | `&kp A` | 通常の key press |
| 押している間だけ layer 1 にする | `&mo 1` | 親指 key などに向いています |
| tap で Space、hold で layer 1 | `&lt 1 SPACE` | layer tap |
| tap で Esc、hold で Left Control | `&mt LCTRL ESC` | mod tap |
| layer 2 へ移動する | `&to 2` | 戻り方も設計してください |
| Bluetooth profile 0 を選ぶ | `&bt BT_SEL 0` | profile 切り替え用 |
| 何もしない key にする | `&none` | 誤入力を防ぐときに使います |
| 下の layer を透過する | `&trans` | layer の一部だけ下位 layer を使うときに使います |

`&none` と `&trans` は似ていますが意味が違います。`&none` は押しても何もしません。`&trans` はその layer では定義せず、下の layer の同じ位置の binding を使います。

### 3.5 Combo を編集する

1. Firmware Mode で中央下部または右側の `Combos` を開きます。
2. 既存 Combo を選ぶか、`追加` を押します。
3. `binding` に発火させたい binding を設定します。
4. key grid で 2 つ以上の key position を選びます。
5. `timeoutMs` を設定します。
6. `Combo binding に反映` または保存操作を押して変更を反映します。

Combo の key position は、手入力ではなく画面上の 1-40 の key grid から選べます。実際に押す組み合わせに対応する位置を選び、中央の Combo overlay で位置関係を確認してください。

Combo 設定で特に大事なのは、`binding`、`key positions`、`timeoutMs` の 3 つです。

| 項目 | 意味 | 設定の考え方 |
| --- | --- | --- |
| `binding` | Combo が成立したときに実行する動作 | `&kp ESC`、`&kp TAB`、`&mo 1` など |
| `key positions` | 同時押しする key の位置 | 2 つ以上を選びます |
| `timeoutMs` | 同時押しと判定する時間 | 短いほど誤爆しにくく、長いほど成立しやすい |

まずは 40-60ms 程度から試し、押しづらければ少し長くします。長くしすぎると通常入力中に Combo が成立しやすくなるため、実際のタイピングで確認してください。

### 3.6 トラックボール設定を編集する

1. Firmware Mode で `Trackball` を開きます。
2. CPI、cursor 感度、scroll 感度、gesture threshold などを確認します。
3. 変更したい値を入力します。
4. `反映` を押します。

Firmware Mode のトラックボール設定は overlay ファイルへ反映されます。左右で別々に設定値がある項目は、画面の field 名と現在値を確認してから変更してください。

主な設定値の見方は次です。

| 項目 | 何が変わるか | 調整の目安 |
| --- | --- | --- |
| CPI | トラックボールの基本感度 | 大きいほど少ない動きで cursor が動く |
| cursor 感度 | pointer 移動の倍率 | 普段の cursor 移動が遅い/速いときに調整 |
| scroll 感度 | scroll 動作の倍率 | scroll が荒い/細かすぎるときに調整 |
| gesture threshold | gesture 判定のしきい値 | 意図せず gesture になる場合は上げる |

一度に大きく変えると原因を切り分けにくくなります。まずは 1 項目ずつ変更し、build + flash 後に実機で確認してください。

### 3.7 diff を確認して保存する

1. `Diff` を開きます。
2. `KobitoKey.keymap`、左 overlay、右 overlay の変更行を確認します。
3. 内容に問題がなければ、中央上部の `保存` を押します。

Tauri デスクトップ版では、読み込んだ `KobitoKey_QWERTY` のファイルへ直接保存されます。なお、`参照…` で File System Access API 対応ブラウザのフォルダピッカーを使った場合は、選んだフォルダのハンドルが残っている間は同じフォルダに直接上書き保存されます(ヘッダに「直接保存」chip が点灯します)。ハンドルが取得できない環境では、変更済みの `KobitoKey.keymap` と overlay ファイルがダウンロードされます。

保存前に見るべきポイントは次です。

- 変更した覚えのない layer が変わっていないか
- left / right overlay のどちらが変わったか
- Combo の key position が意図した位置か
- Raw binding に typo がないか
- `&none` と `&trans` を取り違えていないか

## 4. Firmware を build して UF2 を書き込む

### 4.1 保存後に GitHub Actions build を起動する

1. Firmware Mode で変更を保存します。
2. 必要に応じて `KobitoKey_QWERTY` 側で commit / push します。
3. `Build` または `GitHub Actions` panel を開きます。
4. `build 起動` を押します。
5. `status 更新` で最新 run の状態を確認します。

KobitoKey Studio は `gh workflow run build.yml` と `gh run list` を使って GitHub Actions を操作します。`gh auth login` 済みで、対象リポジトリの workflow を実行できる必要があります。

build を起動する前に、`KobitoKey_QWERTY` 側で保存済みの変更を commit / push しているか確認してください。GitHub Actions は GitHub 上の repository 内容から firmware を作るため、ローカルに保存しただけの変更は build に含まれません。

Firmware repository URL を設定している場合、KobitoKey Studio は `gh -R owner/repo` 相当で対象 repository を明示して GitHub Actions を操作します。ローカルフォルダと GitHub repository が別の場合は、push 先と URL が一致しているか確認してください。

### 4.2 artifact を取得する

1. GitHub Actions の build が成功したことを確認します。
2. `artifact 取得` を押します。
3. artifact は `KobitoKey_QWERTY/.kobitokey-studio/artifacts/` に保存されます。
4. `UF2 / Volume 更新` を押して、取得済み UF2 と bootloader volume を再スキャンします。

左右それぞれの UF2 が生成されていることを確認してください。ファイル名で left / right を取り違えないようにします。

artifact を取得したら、古い UF2 と混ざっていないか確認します。迷う場合は `.kobitokey-studio/artifacts/` の中身を一度整理してから再取得すると、選択ミスを減らせます。

### 4.3 左右の UF2 を bootloader にコピーする

KobitoKey の firmware は左右別々に書き込みます。

1. 左側を USB で接続します。
2. 左側を bootloader mode に入れます。
3. `UF2 / Volume 更新` を押します。
4. left 用 UF2 と左側の bootloader volume を選びます。
5. `UF2 をコピー` を押します。
6. コピー先確認 dialog で、UF2 と volume が正しいことを確認します。
7. 右側へ USB を差し替えます。
8. 右側を bootloader mode に入れます。
9. right 用 UF2 と右側の bootloader volume を選び、同じようにコピーします。

左右両方の bootloader volume が同時に表示される場合は、ケーブルを差し替えずに順番に書き込めます。それでも left UF2 と right UF2 の対応は必ず確認してください。

### 4.4 書き込み前の安全確認

UF2 をコピーする直前に、次を確認してください。

| 確認項目 | 見る場所 |
| --- | --- |
| left 用 UF2 を left half に書く | UF2 ファイル名と接続中 half |
| right 用 UF2 を right half に書く | UF2 ファイル名と接続中 half |
| bootloader volume が本当に KobitoKey か | volume 名、`INFO_UF2.TXT`、`CURRENT.UF2` |
| 直近の build artifact か | GitHub Actions の run 時刻、artifact download 時刻 |
| コピー確認 dialog の内容が正しいか | `UF2 をコピー` 押下後の確認 dialog |

左右を間違えた場合は、正しい UF2 を改めて bootloader にコピーしてください。書き込み後に片側だけ期待通り動かない場合は、左右の UF2 対応を最初に疑います。

## 5. Direct Mode で設定する

### 5.1 Direct Mode の前提

Direct Mode を使うには、KobitoKey 側に ZMK Studio 対応 firmware が入っている必要があります。Studio RPC が firmware に含まれていない場合、接続できない、読み込めない、または一部設定だけ未対応になります。

Direct Mode は、接続中の device へ設定を保存します。左右分割 keyboard の場合、現在 Studio device として接続している側に対して操作していることを意識してください。

Direct Mode の変更は、必ずしも `KobitoKey_QWERTY` のファイルへ戻るわけではありません。長期的に管理したい設定は、あとで Firmware Mode のファイルにも反映しておくと、次回 firmware を作り直したときに差分が消えにくくなります。

Direct Mode の key / Combo / Trackball 書き込みは、成功時に device へ自動保存します。画面の保存状態が `自動保存済み` なら、ZMK Studio 側の未保存変更はありません。`未保存あり` が出る場合は、device 側に保存前の変更が残っている状態です。

### 5.2 USB / Bluetooth で接続する(共通手順)

1. KobitoKey を USB または Bluetooth で接続できる状態にします。
2. 上部のモード切り替えで `Direct` を選びます(ブラウザ版は最初から Direct です)。
3. welcome card の「接続方法」select で `USB` または `Bluetooth` を選びます。
4. その右の Connect ボタン(`USB で接続` または `Bluetooth で接続`)を押します。
5. ブラウザのデバイス選択ダイアログ(Tauri 版ではネイティブの permission picker)が開くので、KobitoKey を選びます。
6. 接続後、ヘッダにデバイス名のチップと `再読み込み` / `切断` ボタンが表示されます。中央には実機の keymap が表示され、右側の `Binding` / `Combos` / `Trackball` / `Timing` tabs が使えます。

ブラウザは USB / Bluetooth device 一覧を事前に列挙できません。`検出` のような事前一覧操作はなく、Connect ボタンを押した時点で browser の permission picker が開く動きになります。

Bluetooth Direct は、ZMK Studio service を公開している device が対象です。接続が不安定な場合や firmware 側の Studio service が見えない場合は、USB Direct を使ってください。設定作業では USB のほうが切り分けしやすくなります。

### 5.5 Direct Mode でキー binding を書き込む

1. Direct Mode で device を読み込みます。
2. layer を選びます。
3. 中央の keyboard で key を選びます。
4. 右側の `Binding` tab で binding を選びます。
5. `実機へ書き込み` を押します。
6. 書き込み後、device から keymap が再読み込みされます。

Direct Mode で対応している主な binding は次です。

| Binding | 用途 |
| --- | --- |
| `&kp KEY` | 通常 key press |
| `&kt KEY` | key toggle |
| `&lt LAYER KEY` | layer tap |
| `&mt HOLD_KEY TAP_KEY` | mod tap / hold tap |
| `&sk KEY` | sticky key |
| `&sl LAYER` | sticky layer |
| `&mo LAYER` | momentary layer |
| `&tog LAYER` | layer toggle |
| `&to LAYER` | layer move |
| `&bt COMMAND VALUE` | Bluetooth 操作 |
| `&mkp VALUE` | mouse button |
| `&mmv VALUE` | mouse move |
| `&msc VALUE` | mouse scroll |
| `&trans` | transparent |
| `&none` | none |
| `&studio_unlock` | Studio unlock |
| `&caps_word` | caps word |
| `&key_repeat` | key repeat |
| `&sys_reset` | system reset |
| `&bootloader` | bootloader |
| `&soft_off` | soft off |
| `&gresc` | grave escape |

ここにない binding や、独自 behavior を含む binding は Firmware Mode で編集してください。

書き込み後は device から keymap を再読み込みします。表示が戻った、または変わらないように見える場合は、書き込み対象 layer と key position が正しいか、Direct Mode 対応 binding かを確認してください。

### 5.6 Direct Mode で Combo を編集する

Direct Combo の書き込みは Tauri デスクトップ版で使います。

1. Direct Mode で device を読み込みます。
2. 右側の `Combos` tab を開きます。
3. `読み込み` を押して実機 Combo を取得します。
4. 既存 Combo を選ぶか、追加します。
5. binding、key positions、timeout を設定します。
6. 保存すると実機へ書き込まれ、device から再読み込みされます。

ブラウザ版では Combo RPC が Web client package から公開されていない場合があります。その場合は Firmware keymap の Combo を読み取り専用で表示するか、未対応として表示されます。Combo を確実に編集したい場合は Tauri デスクトップ版か Firmware Mode を使ってください。

### 5.7 Direct Mode でトラックボール設定を編集する

Direct Trackball の書き込みは Tauri デスクトップ版で使います。

1. Direct Mode で device を読み込みます。
2. `Trackball` tab を開きます。
3. `読み込み` を押して実機の現在値を取得します。
4. CPI、cursor 感度、scroll 感度を編集します。
5. `デバイスに保存` を押します。
6. 保存後、実機から再読み込みされます。

firmware に Trackball RPC が入っていない場合、読み込みや保存に失敗します。その場合は Firmware Mode で overlay を編集し、build + flash してください。

### 5.8 Timing tab について

Direct Mode の `Timing` tab は、予定している操作 UI を表示します。現在は保存対象ではありません。timing 系の詳細設定を確実に反映したい場合は Firmware Mode で該当ファイルを編集し、firmware を build してください。

## 6. 目的別レシピ

### キーを 1 つだけ変えたい

Direct Mode が使えるなら Direct Mode で device を読み込み、対象 key を選んで `実機へ書き込み` します。

おすすめ手順:

1. `Direct` を選びます。
2. USB で接続して読み込みます。
3. layer を選びます。
4. 中央の key を選びます。
5. 右側で `&kp` などの binding を選びます。
6. `実機へ書き込み` を押します。

ZMK Studio 対応 firmware がない、または Direct Mode で未対応の binding を使う場合は Firmware Mode で変更してから build + flash します。

### Combo を追加したい

確実に設定したい場合は Firmware Mode を使います。

おすすめ手順:

1. `Firmware` を選びます。
2. project を読み込みます。
3. `Combos` を開きます。
4. `追加` で Combo を作ります。
5. key grid で同時押し key を選びます。
6. binding と timeout を設定します。
7. `Diff` を確認して保存します。
8. build + UF2 書き込みで反映します。

Tauri デスクトップ版で実機 Combo RPC が使える場合は Direct Mode の `Combos` から追加できます。ブラウザ版や RPC 未対応 firmware の場合は Firmware Mode を使ってください。

### トラックボール感度を調整したい

まず Firmware Mode で設定する方法を推奨します。左右 overlay に設定が残るため、あとから見直しやすくなります。

おすすめ手順:

1. `Firmware` を選びます。
2. project を読み込みます。
3. `Trackball` を開きます。
4. CPI または感度を 1 項目だけ変更します。
5. `Diff` を確認します。
6. 保存して build + UF2 書き込みをします。
7. 実機で動きを確認し、必要なら再調整します。

Tauri デスクトップ版で Direct Trackball RPC が使える場合は Direct Mode の `Trackball` から保存できます。RPC がない場合や左右 overlay を明示的に管理したい場合は Firmware Mode を使ってください。

### GitHub Actions build から書き込みまで行いたい

Firmware Mode で設定を保存し、`KobitoKey_QWERTY` 側で commit / push します。その後、KobitoKey Studio の `GitHub Actions` panel から build を起動し、artifact を download して、左右 UF2 を順番に bootloader volume へコピーします。

### ブラウザ版で試した変更を正式反映したい

初版のブラウザ版は Direct Mode 専用で、Firmware Mode は無効化されています。ブラウザの Direct Mode で実機へ直接書いた変更は、ローカルの `KobitoKey_QWERTY` ファイルへ自動では戻りません。

設定をファイルとして残し、次回 firmware build でも同じ状態を残したい場合は、デスクトップ版を起動し、Firmware Mode の keymap や overlay に同じ設定を反映してください。

### 設定後に動作確認したい

最低限、次を確認してください。

| 確認対象 | 確認内容 |
| --- | --- |
| layer 切り替え | `&mo`、`&lt`、`&to` が意図した layer に移動するか |
| 通常 key | 文字、記号、modifier が想定通り入力されるか |
| Combo | 通常入力で誤爆せず、狙った同時押しで成立するか |
| Trackball | cursor と scroll の速度が使いやすいか |
| 左右 half | left / right の両方に正しい UF2 が入っているか |

問題がある場合は、一度に複数箇所を直さず、1 つずつ変更して再確認します。

## 用語集

| 用語 | 意味 |
| --- | --- |
| keymap | layer ごとの key binding と Combo を含む設定 |
| layer | キーボードの面。通常 layer、記号 layer、数字 layer などを切り替えて使う |
| binding | key に割り当てる動作。例: `&kp A`、`&mo 1` |
| behavior | ZMK の動作種別。`&kp`、`&lt`、`&mt` など |
| Combo | 複数 key の同時押しで別の binding を発火する設定 |
| overlay | hardware や左右 half ごとの設定を書くファイル |
| CPI | トラックボール sensor の基本感度 |
| UF2 | bootloader volume にコピーして firmware を書き込むファイル |
| bootloader mode | UF2 書き込み用の volume として keyboard half が mount される状態 |
| artifact | GitHub Actions build が生成する成果物 |
| ZMK Studio | 対応 firmware に接続して keymap などを直接読み書きする仕組み |

## 7. トラブルシューティング

### `Firmware` トグルが押せない

初版のブラウザ版では Firmware Mode を無効化しています。ヘッダの `Firmware` ボタンには `Desktop限定` バッジが付き、disabled になっています。Firmware Mode を使うには `npm run tauri dev` でデスクトップ版を起動してください。

### `読み込み失敗` になる

指定したフォルダが `KobitoKey_QWERTY` のルートか確認してください。少なくとも次のファイルが存在する必要があります。

```txt
config/KobitoKey.keymap
config/boards/shields/KobitoKey/KobitoKey_left.overlay
config/boards/shields/KobitoKey/KobitoKey_right.overlay
```

### Direct Mode で device が見つからない

- USB ケーブルが data 通信対応か確認します。
- ZMK Studio 対応 firmware が入っているか確認します。
- Tauri 版では `検出` を押して候補 port を再取得します。
- ブラウザ版では Chrome/Edge を使い、`localhost` または HTTPS から開きます。
- ブラウザの permission picker で正しい device を選びます。

### Direct 書き込みに失敗する

- device を読み込んでから書き込んでいるか確認します。
- 選択中 layer と key position が正しいか確認します。
- Direct Mode 対応 binding か確認します。
- 独自 behavior や未対応 binding は Firmware Mode で編集します。

### Combo が Direct Mode で編集できない

ブラウザ版では Combo RPC が未公開のため、読み取り表示または未対応になる場合があります。デスクトップ版で試すか、Firmware Mode(デスクトップ版のみ)で `KobitoKey.keymap` の Combo を編集してください。

### Trackball が Direct Mode で保存できない

firmware に Trackball RPC が含まれていない可能性があります。デスクトップ版の Firmware Mode の `Trackball` で overlay を編集し、build + flash してください。ブラウザ版では Trackball は未対応として表示されます。

### GitHub Actions build が起動できない

- `gh auth login` が済んでいるか確認します。
- `KobitoKey_QWERTY` の root path が正しいか確認します。
- Firmware repository URL が正しい GitHub repository を指しているか確認します。
- GitHub Actions の `build.yml` workflow が対象リポジトリに存在するか確認します。
- workflow を実行できる GitHub 権限があるか確認します。

### UF2 volume が表示されない

- keyboard half が bootloader mode に入っているか確認します。
- macOS の `/Volumes` に bootloader volume が mount されているか確認します。
- `UF2 / Volume 更新` を押して再スキャンします。
- left / right のどちらを接続しているか確認します。

## 8. 公開ページの更新方法

このガイドは GitHub Pages 用に `docs/` 配下へ置いています。変更を公開するには、変更を commit して repository の default branch へ push します。

初回だけ、GitHub repository の `Settings` → `Pages` で source を `GitHub Actions` に設定してください。以後は `.github/workflows/pages.yml` が `docs/` を Pages artifact として deploy します。

公開 URL は次の形式です。

```txt
https://s-hiraoku.github.io/kobitokey-studio/
```

使い方ガイドの直接 URL は次です。

```txt
https://s-hiraoku.github.io/kobitokey-studio/usage-guide/
```
