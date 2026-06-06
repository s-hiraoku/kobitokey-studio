---
layout: page
title: KobitoKey Studio 使い方ガイド
permalink: /usage-guide/
---

# KobitoKey Studio 使い方ガイド

このガイドのゴールは、ユーザが自分で KobitoKey Studio を起動し、目的に合うモードを選び、キーマップ、Combo、トラックボール設定、Firmware build、UF2 書き込みまで進められるようにすることです。

設定内容ごとにアプリを直接開く場合は [ユーザガイド](../user-guide/) を使ってください。

## 初版でできること(重要)

初版リリースでは、公開版はブラウザ版を基準に案内します。デスクトップ版は一部ユーザー向けのローカル作業用です。

| ビルド | Direct Mode (キー) | Direct Mode (Combo / Trackball) | Firmware Mode |
| --- | --- | --- | --- |
| ブラウザ版 (`npm run dev`) | ✅ 利用可 | Combo / Trackball は参照のみ | ✅ GitHub 連携対応 |
| デスクトップ版 (`npm run tauri dev`) | ✅ 利用可 | Combo / Trackball は参照のみ | ✅ 一部ユーザー向け |

- ブラウザ版 Firmware Mode は GitHub 連携で利用できます。GitHub OAuth device flow または GitHub token をメモリ上で使い、repository 読み込み、commit、GitHub Actions build、artifact 取得、left / reset / right UF2 分類まで進めます。
- OAuth device flow と artifact download は release gate で CORS / scope / rate limit を確認します。
- デスクトップ版 Firmware Mode は、ローカル clone、`gh` CLI、bootloader volume 検出を使う従来フローです。

## まず結論

KobitoKey Studio では、最初に `Firmware Mode` と `Direct Mode` のどちらを使うかを選びます。

| 迷っている内容 | 選ぶもの | 理由 |
| --- | --- | --- |
| キーを 1 個だけ素早く変更したい | Direct Mode | ビルドと UF2 書き込みなしで実機へ保存できるため |
| ブラウザだけで試したい | Direct Mode または Firmware Mode (Chrome/Edge) | Direct は実機キー書き込み、Firmware は GitHub 経由で build まで進めるため |
| Combo を設定したい | Firmware Mode | 現在の ZMK Studio firmware は Combo RPC を公開していないため |
| トラックボールを設定したい | Firmware Mode | 現在の KobitoKey firmware では Direct Mode 書き込み未対応のため |
| 設定をファイルとして残したい / GitHub Actions ビルドまで進めたい | Firmware Mode | ブラウザ版は GitHub 経由、デスクトップ版はローカル clone 経由で進めるため |

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
| `KobitoKey_QWERTY` の GitHub repository がある | 必須。ブラウザ版では書き込み権限のある repository を指定します | 任意 |
| `config/KobitoKey.keymap` が読める | 必須 | 任意 |
| 左右 overlay ファイルが読める | Trackball 編集に必須 | 任意 |
| GitHub 認証済み | Firmware Mode の build に必須。ブラウザ版は OAuth/token、Tauri 版は `gh auth login` | 不要 |
| ZMK Studio 対応 firmware が入っている | 不要 | 必須 |
| USB data 通信できるケーブルがある | UF2 書き込みに必須 | USB Direct に必須 |
| Chrome または Edge を使っている | ブラウザ版では推奨 | ブラウザ Direct では必須 |

ブラウザ版の Firmware Mode では、ローカル clone は不要です。GitHub 上の repository を読み込み、編集後に同じ repository へ commit し、GitHub Actions build、artifact download、left / reset / right UF2 の順番ガイドまで一つの画面で進められます。公式 repository に書き込み権限がない場合は、GitHub 上で `KobitoKey_QWERTY` を fork し、その fork の URL を `Firmware repository` に指定してください。Tauri デスクトップ版では、ローカルファイル保存、`gh` CLI、bootloader volume 検出を使う従来フローを一部ユーザー向けに利用できます。

## 画面の見方

KobitoKey Studio の画面は、主に 4 つの領域に分かれています。

| 場所 | 役割 |
| --- | --- |
| 上部バー | `Firmware` / `Direct` の切り替え、プロジェクト読み込み、接続状態 |
| 左側 | layer 一覧 |
| 中央 | 実際の KobitoKey 形状に沿った keymap 表示、Combo overlay、編集 tabs、Build/Flash とリセット actions |
| 右側 | 選択中 key の動作編集 |
| 中央下部 tabs | Combo、Trackball、Diff 操作 |

基本操作は「左で layer を選ぶ → 中央で key を選ぶ → 右で設定する」です。

### よく使うボタン

| ボタン | ある場所 | 何をするか |
| --- | --- | --- |
| `参照…` | Firmware Mode 上部 | Tauri 版で `KobitoKey_QWERTY` フォルダを picker で選ぶ |
| `読み込み` | Firmware Mode 上部 | 指定した project から keymap と overlay を読む |
| `GitHub から読み込み` | Firmware Mode Build/Flash | ブラウザ版で repository の keymap と overlay を読む |
| Firmware repository URL | `Build & Flash` ボタンで開く画面 | GitHub Actions を実行する firmware repository を指定する |
| `編集をリセット` | Firmware Mode 中央下部 | 未 commit / 未保存の keymap と overlay 編集を読み込み時点へ戻す |
| `保存` | Firmware Mode 中央上部 | 編集した keymap / overlay をローカルへ保存する(ハンドルがあればフォルダに直接上書き、なければダウンロード) |
| 接続方法 select + Connect ボタン | Direct 接続パネル | USB か Bluetooth を選んでブラウザのデバイス選択ダイアログを開く |
| `再読み込み` | Direct Mode 上部 (接続済み) | 実機から keymap などを再取得する |
| `切断` | Direct Mode 上部 (接続済み) | 実機との接続を切る |
| `書き込み予定に追加` / `実機へ書き込み` | Direct Mode 右側 | 選択中 key の動作を確認し、実機へ保存する |
| `UF2 / Volume 更新` | Firmware Mode Build/Flash | Tauri 版で artifact と bootloader volume を再スキャンする |

## モード早見表

KobitoKey Studio には大きく分けて 2 つのモードがあります。

| モード | 使う場面 | 設定の反映方法 |
| --- | --- | --- |
| Firmware Mode | `KobitoKey_QWERTY` の設定ファイルを編集し、Firmware を作り直す | GitHub Actions で build し、左右の UF2 を bootloader にコピーする |
| Direct Mode | ZMK Studio 対応 firmware が入った実機へ、対応済み設定を直接書き込む | USB または Bluetooth で接続し、実機の不揮発設定へ保存する |

## 作業フロー早見表

### Firmware Mode の基本フロー

1. PC の Chrome / Edge でブラウザ版を開き、`Firmware` を選ぶ
2. `Build & Flash` で GitHub に接続し、repository と branch を指定して `GitHub から読み込み` を押す
3. layer と key を選んでキー動作を変更する
4. 必要なら Combo やトラックボールも変更する
5. `Diff` で変更内容を確認する
6. `Diff 確認済み`、`Commit & Build`、`Artifact 取得` の順に進める
7. 左右それぞれで reset UF2、firmware UF2 の順に bootloader にコピーする

### Direct Mode の基本フロー

1. `Direct` を選ぶ
2. USB で KobitoKey を接続する(Bluetooth は見つかる場合のみ)
3. 実機 keymap を読み込む
4. layer と key を選ぶ
5. キー動作を選ぶ
6. `書き込み予定に追加`、`実機へ書き込み` の順に押す
7. 書き込み後に再読み込みされた表示を確認する

Direct Mode でキーを書き込む場合は、ブラウザ版または Tauri デスクトップ版を使えます。Combo と Trackball は参照のみです。ブラウザ版では USB 接続を推奨します。

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
| ブラウザ版 | Direct Mode の試用とキー動作の書き込み、GitHub 連携 Firmware Mode |
| Tauri デスクトップ版 | ローカル clone を直接扱う Firmware Mode、`gh` CLI 経由のビルド、bootloader volume 検出、Direct の key 書き込み |

ブラウザ公開版では、Firmware Mode を GitHub 経由の安全な commit / build / artifact / UF2 保存フローとして使えます。Tauri デスクトップ版は一部ユーザー向けに配布するローカル作業用です。

### ローカル開発版の起動

ブラウザ版を試すなら、KobitoKey Studio のリポジトリで次を実行します。

```sh
npm install
npm run dev
```

起動後、Chrome または Edge で `http://127.0.0.1:1420/` を開きます。Direct Mode と Firmware Mode を切り替えられます。

ローカル clone を直接扱う従来の Firmware Mode を使うには、Rust と Cargo を用意したうえで Tauri デスクトップ版を起動します。

```sh
npm run tauri dev
```

Tauri デスクトップ版では、ローカルファイルの読み書き、`gh` CLI 経由の GitHub Actions 操作、artifact download、UF2 コピー、Direct key 書き込みなどを使えます。

### GitHub 認証の準備

ブラウザ版 Firmware Mode は、GitHub OAuth device flow または GitHub token を使います。OAuth を使う公開環境では `VITE_GITHUB_OAUTH_CLIENT_ID` を設定してください。OAuth flow は managed firmware files の読み書きと Actions build 起動のために `repo` scope を要求します。fine-grained token を手入力する場合は、対象 firmware repository だけに Contents write と Actions write を付け、作業後は `token を消去` を押すか画面を閉じて破棄してください。公式 repository に直接書き込めないユーザーは、GitHub 上で fork を作り、その fork に対する権限を token/OAuth に付けます。

Tauri 版 Firmware Mode の GitHub Actions build 操作は、Tauri backend から `gh` CLI を呼び出します。初回は次で認証してください。

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

編集後は保存し、GitHub Actions で firmware を build し、生成された左右の UF2 をそれぞれの bootloader volume にコピーします。設定が firmware に焼き込まれるため、Direct Mode が未対応のキー動作や overlay 設定も扱えます。

### Direct Mode を選ぶ場合

Direct Mode は、ZMK Studio API を使って実機へ直接設定を書き込みます。build と UF2 書き込みを待たずに反映できる点が利点です。

ただし、Direct Mode で扱える設定は firmware 側の Studio RPC と KobitoKey Studio 側の実装に依存します。未対応の設定は Firmware Mode で編集し、build + flash してください。

### Tauri デスクトップ版とブラウザ版の違い

| 機能 | Tauri デスクトップ版 | ブラウザ版 |
| --- | --- | --- |
| Firmware Mode (トグル) | 利用可 | GitHub 連携対応 |
| Firmware ファイル読み込み | ローカルフォルダから読み込み | GitHub repository から読み込み |
| Firmware ファイル保存 | ローカルファイルへ直接保存 | GitHub commit として保存 |
| GitHub Actions build | `gh` CLI 経由で対応 | GitHub API 経由で対応 |
| Artifact download | 対応 | 対応 |
| UF2 bootloader copy | bootloader volume へコピー | File System Access API で UF2 bootloader marker を確認して保存 |
| Direct USB | 対応 | Chrome/Edge の Web Serial で対応 |
| Direct Bluetooth | 対応環境で利用 | 実験的対応。見つからない場合は USB 推奨 |
| Direct キー動作 write | 対応 | 対応 |
| Direct Combo write | 参照のみ | 参照のみ |
| Direct Trackball write | 参照のみ | 参照のみ |

ブラウザ版で Direct Mode を使う場合は、Chrome または Edge で `127.0.0.1`、`localhost`、または HTTPS から開いてください。Web Serial / Web Bluetooth は、通常の `file://` や安全でない HTTP では利用できません。

### 保存先と反映先の違い

設定の種類ごとに、保存される場所と反映方法が違います。

| 設定 | Firmware Mode の保存先 | Firmware Mode の反映 | Direct Mode の保存先 | Direct Mode の反映 |
| --- | --- | --- | --- | --- |
| キー動作 | `KobitoKey.keymap` | build + UF2 書き込み | 実機の Studio 設定 | 書き込み直後 |
| Combo | `KobitoKey.keymap` | build + UF2 書き込み | — | Direct Mode では参照のみ |
| Trackball | 左右 overlay | build + UF2 書き込み | — | Direct Mode では参照のみ |
| Timing | 該当 firmware 設定ファイル | build + UF2 書き込み | 現在は保存対象外 | 未対応 |
| GitHub Actions build | なし | UF2 artifact を生成 | なし | 対象外 |

Firmware Mode は「ファイルを更新してから firmware に焼き込む」流れです。Direct Mode は「接続中の実機へその場で保存する」流れです。どちらで変更したか分からなくなった場合は、最終的に反映したい状態を Firmware Mode のファイルへ残しておくと管理しやすくなります。

## 3. Firmware Mode で設定する

> ブラウザ版では GitHub 連携で動作します。ローカル clone を直接読み書きしたい場合は `npm run tauri dev` でデスクトップ版を起動してください。

### 3.1 プロジェクトを読み込む

1. 上部のモード切り替えで `Firmware` を選びます。
2. ブラウザ版では中央下部の `Build & Flash` ボタンで `Firmware repository URL` と branch を指定し、GitHub に接続して `GitHub から読み込み` を押します。Tauri 版ではヘッダの「プロジェクトフォルダ」入力欄の隣にある `参照…` を押し、`KobitoKey_QWERTY` のローカルフォルダを選びます。
3. Tauri 版では `読み込み` を押します。
4. (任意)Tauri 版でビルドまで進める場合は `Build & Flash` ボタンを押し、`Firmware repository URL` に GitHub の repository URL を指定します。

ブラウザ版の初回は GitHub repository URL と branch を指定してください。ローカル clone の用意は不要です。公式 repository へ書き込めない場合は、GitHub 上の fork URL を指定します。Tauri 版のプロジェクトフォルダ初期値は空です。初回は `参照…` で `KobitoKey_QWERTY` をクローンしているローカルフォルダを選んでください。

読み込みに成功すると、左側に layer 一覧、中央に KobitoKey の物理レイアウト、右側に選択中キーの編集 panel が表示されます。

読み込み後に最初に見る場所は、左側の layer 一覧です。layer を切り替えると中央の key 表示が変わります。中央の key をクリックすると、右側の inspector がその key の編集画面になります。

ブラウザ版では GitHub repository URL を keymap / overlay の読み書き、GitHub Actions の build 起動、最新 run 確認、artifact 取得に使います。公式 repository に書き込み権限がない場合は、GitHub 上の fork URL を指定してください。Tauri 版ではローカルフォルダを keymap / overlay の読み書きに使い、Firmware repository URL を Actions 操作に使います。
repository は `owner/repo`、`https://github.com/owner/repo`、または `git@github.com:owner/repo.git` の形で入力してください。`tree/main` や `blob/...` 付きの URL、query/hash 付きの URL は対象 repository が曖昧になるため読み込み前に拒否します。branch は `feature/firmware-mode` のように `/` を含む名前でも使えます。

Firmware Mode では layer 一覧の上にある `+` で末尾に空の layer を追加し、copy で選択中 layer を末尾に複製できます。trash は layer 番号参照のずれを避けるため、最後の layer を選んでいるときだけ有効になります。キー動作や Combo の動作 / `layers` 指定から参照されている layer は削除できません。Direct Mode では実機の layer 構造変更は行いません。

### 3.2 キー動作を編集する

1. 左側の layer 一覧から編集したい layer を選びます。
2. 中央のキーボード図で変更したい key をクリックします。
3. 右側の動作エディタで動作タイプを選びます。
4. on-screen picker から keycode、layer、modifier、mouse button、Bluetooth action などを選びます。
5. `選択キーに反映` を押します。
6. 中央の表示と右側の preview が変わったことを確認します。

Firmware Mode の編集は、押した時点ではまだローカルファイルへ保存されません。画面上の変更を確認してから `Firmwareファイルを保存` または `Firmwareファイルをダウンロード` を押してください。

変更後は、対象 key の表示と右側の preview が意図した動作になっているか確認します。複雑な ZMK 構文は label が短縮表示されることがありますが、tooltip や inspector では元の ZMK 構文を確認できます。

### 3.3 動作 picker の使い分け

| 種類 | 使う ZMK 構文 | 入力内容 |
| --- | --- | --- |
| 通常キー | `&kp KEY` | 文字、数字、記号、navigation、function、media/system key |
| Layer Tap | `&lt LAYER KEY` | tap 時の key と hold 時の layer |
| Mod Tap | `&mt MOD KEY` | hold 時の modifier と tap 時の key |
| Momentary Layer | `&mo LAYER` | 押している間だけ有効にする layer |
| To Layer | `&to LAYER` | 移動先 layer |
| Mouse Button | `&mkp VALUE` | mouse button |
| Bluetooth | `&bt COMMAND VALUE` | profile 選択や clear など |
| Raw | 任意の ZMK 構文 | picker 未対応の動作を直接入力 |

Raw は、KobitoKey Studio がまだ構造化 UI を持たないキー動作を扱うための逃げ道です。ZMK の構文を理解している場合だけ使ってください。

### 3.4 よく使う動作例

| やりたいこと | ZMK 構文例 | 補足 |
| --- | --- | --- |
| `A` を入力する | `&kp A` | 通常の key press |
| 押している間だけ layer 1 にする | `&mo 1` | 親指 key などに向いています |
| tap で Space、hold で layer 1 | `&lt 1 SPACE` | layer tap |
| tap で Esc、hold で Left Control | `&mt LCTRL ESC` | mod tap |
| layer 2 へ移動する | `&to 2` | 戻り方も設計してください |
| Bluetooth profile 0 を選ぶ | `&bt BT_SEL 0` | profile 切り替え用 |
| 何もしない key にする | `&none` | 誤入力を防ぐときに使います |
| 下の layer を透過する | `&trans` | layer の一部だけ下位 layer を使うときに使います |

`&none` と `&trans` は似ていますが意味が違います。`&none` は押しても何もしません。`&trans` はその layer では定義せず、下の layer の同じ位置の動作を使います。

### 3.5 Combo を編集する

1. Firmware Mode で中央下部の `Combos` tab を開きます。
2. 既存 Combo を選ぶか、`追加` を押します。
3. Combo 成立時に発火させたい動作を設定します。
4. key grid で 2 つ以上の key position を選びます。
5. `timeoutMs` を設定します。
6. Combo の動作、keys、timeoutMs を確認し、`Combo の編集を保存` で編集内容に保存します。

Combo の key position は、手入力ではなく画面上の 1-40 の key grid から選べます。実際に押す組み合わせに対応する位置を選び、中央の Combo overlay で位置関係を確認してください。

Combo 設定で特に大事なのは、成立時の動作、`key positions`、有効 layer、`timeoutMs` です。Combo 一覧と詳細には、その Combo が全 layer で有効か、特定 layer だけで有効かが表示されます。

| 項目 | 意味 | 設定の考え方 |
| --- | --- | --- |
| 動作 | Combo が成立したときに実行する動作 | `&kp ESC`、`&kp TAB`、`&mo 1` など |
| `key positions` | 同時押しする key の位置 | 2 つ以上を選びます |
| `layers` | Combo が有効な layer。未指定なら全 layer | `1 2` |
| `timeoutMs` | 同時押しと判定する時間 | 短いほど誤爆しにくく、長いほど成立しやすい |

まずは 40-60ms 程度から試し、押しづらければ少し長くします。長くしすぎると通常入力中に Combo が成立しやすくなるため、実際のタイピングで確認してください。

### 3.6 トラックボール設定を編集する

1. Firmware Mode で `Trackball` を開きます。
2. CPI、cursor 感度、scroll 感度、gesture threshold などを確認します。
3. 変更したい値を入力します。
4. `トラックボール編集を保存` を押します。

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
3. 内容に問題がなければ、ブラウザ版では `Build & Flash` の `Diff 確認済み` を押します。Tauri 版では中央上部の `保存` を押します。

ブラウザ版では、`Commit & Build` で GitHub repository に commit を作るまで firmware repository は更新されません。Tauri デスクトップ版では、読み込んだ `KobitoKey_QWERTY` のファイルへ直接保存されます。
変更を破棄したい場合は、中央下部の `編集をリセット` で keymap と overlay を読み込み時点へ戻せます。`Build & Flash` 画面では編集 tabs は隠れます。編集へ戻る場合はパネル内の `編集に戻る` を押します。

保存前に見るべきポイントは次です。

- 変更した覚えのない layer が変わっていないか
- left / right overlay のどちらが変わったか
- Combo の key position が意図した位置か
- ZMK 直接入力の構文に typo がないか
- `&none` と `&trans` を取り違えていないか

## 4. Firmware を build して UF2 を書き込む

### 4.1 GitHub Actions build を起動する

ブラウザ版:

1. `Build & Flash` ボタンを押します。
2. `Firmware repository` と `Branch` を確認します。Branch が空の場合、GitHub 読み込みや commit/build は進めません。
3. `GitHub で接続`、または token 入力で GitHub に接続します。device flow の新規タブが開かない場合は、画面に出る `GitHub 認証を開く` リンクを押して user code を入力します。
4. `GitHub から読み込み` で keymap / overlay を読み込みます。
5. 編集後、`Diff 確認済み` を押します。
6. `Commit & Build` を押します。
7. 画面に commit SHA が出たことを確認します。対象 commit の run は自動確認されます。

ブラウザ版の `Commit & Build` は、Studio が扱う `config/KobitoKey.keymap`、left overlay、right overlay だけを 1 commit にまとめ、同じ branch の `build.yml` workflow を起動します。token はメモリ上だけで使い、local storage には保存しません。作業後に同じタブを開いたままにする場合は `token を消去` でメモリ上の token も消せます。commit は作成できたが workflow 起動だけ失敗した場合は、同じ画面の `Build 起動` で対象 commit の build を再試行できます。

Tauri 版:

1. Firmware Mode で変更します。
2. `Build & Flash` ボタンを押します。
3. 初回または設定変更後は `接続確認` を押します。
4. すべて OK になったら `保存してBuild` を押します。
5. `status 更新` で最新 run の状態を確認します。

Tauri 版は `gh workflow run build.yml` と `gh run list` を使って GitHub Actions を操作します。`gh auth login` 済みで、対象リポジトリの workflow を実行できる必要があります。

`接続確認` は、選択中フォルダが git repository か、必要な keymap / overlay があるか、`origin` と branch があるか、`gh` CLI と GitHub 認証が使えるか、`build.yml` workflow が見えるかを確認します。

`保存してBuild` は、Studio が扱う `config/KobitoKey.keymap`、left overlay、right overlay だけを保存し、その 3 ファイルだけを `git add` して commit / push してから build workflow を起動します。repository 内の他の変更は勝手に stage しません。

Firmware repository URL を設定している場合、KobitoKey Studio は対象 repository を明示して GitHub Actions を操作します。ローカルフォルダと GitHub repository が別の場合は、push 先と URL が一致しているか確認してください。

推奨構成は、ユーザーごとの firmware repository を template から作成し、build logic は reusable workflow 側に寄せる形です。ユーザー repository には keymap / overlay と薄い `build.yml` だけを置くと、Studio からの自動 commit / push と相性がよくなります。

### 4.2 artifact を取得する

1. GitHub Actions の build が成功したことを確認します。
2. `Artifact 取得` を押します。
3. ブラウザ版では、表示中 commit と一致する成功 run であることを GitHub API で再確認してから artifact zip を取得し、画面内で展開します。Tauri 版では、最新の成功 run から artifact を取得し、`KobitoKey_QWERTY/.kobitokey-studio/artifacts/` に保存します。
4. 取得後、Studio は UF2 を再スキャンし、manifest があればそれを優先して left / reset / right を分類します。manifest がない場合はファイル名から推定します。Flash パネルには left / reset / right UF2 と manifest の GitHub artifact 名 / id も表示されます。公開判定の証跡では、画面に表示された artifact 名 / id が GitHub Actions の build artifact と一致し、manifest が指す UF2 が同じ GitHub artifact 内にあることも確認します。

left / reset / right の UF2 が生成されていることを確認してください。ファイル名で left / right を取り違えないようにします。

ブラウザ版では、artifact が存在しない、すべて期限切れ、または zip の中に UF2 が含まれない場合は、artifact 取得を失敗として止めます。`Artifact 取得` を押した時点で前回取得した UF2 と左右の書き込み完了状態は破棄されるため、失敗後に古い UF2 を誤って書き込むことはできません。その場合は `Build 起動` で新しい run を作り、GitHub Actions の artifact upload 設定と build 出力を確認してください。

ブラウザ版は token や artifact bytes を local storage に保存しません。保存するのは repository、branch、commit、run id などの再開用 metadata だけで、壊れた URL や一致しない commit/run link は復元時に破棄します。画面を閉じた後に再開する場合は、GitHub に再接続してから `Artifact 取得` を押すと、保存済み run id から再取得できます。Tauri 版で古い UF2 と混ざる場合は `.kobitokey-studio/artifacts/` の中身を一度整理してから再取得すると、選択ミスを減らせます。

### 4.2.1 Firmware Mode の再開ルート

ブラウザ版 Firmware Mode は、どこまで進んでいるかに合わせて途中から再開できます。

| 今の状態 | 操作 | 補足 |
| --- | --- | --- |
| Studio でこれから編集する | `GitHub から読み込み` → 編集 → `Diff 確認済み` → `Commit & Build` → `Artifact 取得` | 変更を repository に commit し、対象 commit の build artifact を使います |
| 編集と build は完了している | GitHub に接続し、repository / branch / run を確認して `Artifact 取得` | 画面に保存された run metadata があれば、再接続後に artifact を再取得できます |
| artifact zip を GitHub Actions などから手元に保存済み | zip を展開し、`Artifact フォルダから再開` | GitHub token や commit/run の再接続なしで Flash パネルへ進めます |
| UF2 ファイルだけ持っている | left / reset / right UF2 を1つのフォルダにまとめ、`Artifact フォルダから再開` | ファイル名から分類できる必要があります |

`Artifact フォルダから再開` は Flash だけをやり直したいときに便利です。GitHub から artifact を再取得しなくても、展開済み artifact フォルダを選べば left / reset / right の UF2 を読み込んで書き込みボタンを有効化できます。

フォルダ再開で選ぶ場所は、`.zip` ファイルではなく展開済みフォルダです。フォルダ内のサブフォルダも再帰的に読みます。現在のフォルダ再開は UF2 ファイル名で分類するため、`left`、`right`、`reset` または `settingsreset` が分かる名前にしてください。manifest にしか side 情報がない artifact は、GitHub run から `Artifact 取得` するルートを使うほうが確実です。

### 4.3 左右の UF2 を bootloader にコピーする

KobitoKey の firmware は左右別々に書き込みます。

1. 左側を USB で接続し、bootloader mode に入れます。
2. ブラウザ版では `Left reset を直接コピー` を押し、`INFO_UF2.TXT` がある Left 側の bootloader volume を選びます。Tauri 版では `Left` を選び、`UF2 / Volume 更新`、`Left UF2 を bootloader にコピー` の順に押します。
3. 左側をもう一度 bootloader mode に入れ、`Left firmware を直接コピー` で Left 側の firmware UF2 を書き込みます。
4. 右側へ USB を差し替えて bootloader mode に入れます。
5. `Right reset を直接コピー`、もう一度 bootloader mode、`Right firmware を直接コピー` の順に進めます。Tauri 版では `Right UF2 を bootloader にコピー` を押します。

ブラウザ版は Finder での手動コピーを通常ルートにしません。Chrome のフォルダ選択で `INFO_UF2.TXT` がある bootloader volume を選び、artifact 内の reset UF2 を先に直接コピーしてから、同じ side の firmware UF2 を直接コピーします。reset UF2 を書くと bootloader volume が消える場合があるため、同じ側をもう一度 bootloader mode に入れてから firmware UF2 を書き込んでください。

左右両方の bootloader volume が同時に表示される場合は、ケーブルを差し替えずに順番に書き込めます。artifact に `manifest.json` または `firmware-manifest.json` が含まれている場合、Studio は manifest の `left` / `right` / `reset` / `outputs[].side` / `outputs[].file` を使います。manifest がない場合は、ファイル名に `left` / `right` / `reset` が含まれる前提で推定します。分類できない場合、left / right が別パスでも同じ UF2 ファイル名になる場合、または reset UF2 がない場合は、書き込みボタンが有効になりません。書き込み前には表示中の UF2 名に加えて `artifact <name> #<id>` が想定した GitHub Actions artifact と一致していることも確認してください。

Direct Mode / ZMK Studio で保存した runtime keymap は ZMK の永続設定に残り、通常 firmware を flash しても `.keymap` の変更より優先されることがあります。そのためブラウザ版の Firmware mode では、artifact に含まれる settings reset UF2 を先に書き込んでから通常の Left / Right UF2 を書き込みます。

### 4.4 書き込み前の安全確認

UF2 をコピーする直前に、次を確認してください。

| 確認項目 | 見る場所 |
| --- | --- |
| left 用 UF2 を left half に書く | UF2 ファイル名と接続中 half |
| right 用 UF2 を right half に書く | UF2 ファイル名と接続中 half |
| bootloader volume が本当に KobitoKey か | volume 名、`INFO_UF2.TXT`、`CURRENT.UF2` |
| 直近の build artifact か | GitHub Actions の run 時刻、artifact download 時刻 |
| コピー先が bootloader volume か | ブラウザ版の folder picker または Tauri 版のコピー確認 dialog |

左右を間違えた場合は、正しい UF2 を改めて bootloader にコピーしてください。書き込み後に片側だけ期待通り動かない場合は、左右の UF2 対応を最初に疑います。

## 5. Direct Mode で設定する

### 5.1 Direct Mode の前提

Direct Mode を使うには、KobitoKey 側に ZMK Studio 対応 firmware が入っている必要があります。Studio RPC が firmware に含まれていない場合、接続できない、読み込めない、または一部設定だけ未対応になります。

Direct Mode は、接続中の device へ設定を保存します。左右分割 keyboard の場合、現在 Studio device として接続している側に対して操作していることを意識してください。

Direct Mode の変更は、必ずしも `KobitoKey_QWERTY` のファイルへ戻るわけではありません。長期的に管理したい設定は、あとで Firmware Mode のファイルにも反映しておくと、次回 firmware を作り直したときに差分が消えにくくなります。

Direct Mode で device を読み込むと、実機 keymap と現在読み込んでいる firmware keymap のキー動作差分を Direct summary で確認できます。差分行の `このキー差分を取り込む` またはパネル上部の `キー差分を Firmware に取り込む` を押すと、Direct 側の差分を firmware keymap に取り込めます。ファイルへの保存または書き出しは Firmware Mode で実行します。Combo は Direct Mode では参照のみです。

Direct Mode の key 書き込みは、成功時に device へ自動保存します。Combo、Trackball、Timing は参照または未対応表示のみです。画面の保存状態が `自動保存済み` なら、ZMK Studio 側の未保存変更はありません。`未保存あり` が出る場合は、device 側に保存前の変更が残っている状態です。

### 5.2 USB / Bluetooth で接続する(USB 推奨)

1. まず USB data cable で KobitoKey を接続します。
2. 上部のモード切り替えで `Direct` を選びます(ブラウザ版は最初から Direct です)。
3. 接続パネルの「接続方法」で `USB` を選びます。
4. `USB で接続` を押します。
5. ブラウザのデバイス選択ダイアログ(Tauri 版ではネイティブの permission picker)が開くので、KobitoKey を選びます。
6. 接続後、ヘッダにデバイス名のチップ、保存状態、対応機能、`再読み込み` / `切断` ボタンが表示されます。中央には実機の keymap が表示され、右側の `Key Config` / `Combos` / `Trackball` / `Timing` tabs が使えます。

ブラウザは USB / Bluetooth device 一覧を事前に列挙できません。`検出` のような事前一覧操作はなく、Connect ボタンを押した時点で browser の permission picker が開く動きになります。

Bluetooth Direct は実験的対応です。試す場合は「接続方法」で `Bluetooth` を選び、通常のキーボード接続ではなく ZMK Studio 用として表示される device を選びます。ZMK Studio 用の device が見えない、接続が不安定、または書き込みが失敗する場合は USB Direct を使ってください。設定作業では USB のほうが切り分けしやすくなります。

### 5.3 Direct Mode でキー動作を書き込む

1. Direct Mode で device を読み込みます。
2. layer を選びます。
3. 中央の keyboard で key を選びます。
4. 右側の `Key Config` tab で現在の動作と書き込み予定の動作を確認します。
5. `書き込み予定に追加` を押します。
6. `実機へ書き込み` を押します。
7. 書き込み後、device から keymap が再読み込みされます。

Direct Mode で対応している主なキー動作は次です。

| ZMK 構文 | 用途 |
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

ここにないキー動作や、独自 behavior を含む ZMK 構文は Firmware Mode で編集してください。

書き込み後は device から keymap を再読み込みします。表示が戻った、または変わらないように見える場合は、書き込み対象 layer と key position が正しいか、Direct Mode 対応キー動作かを確認してください。

### 5.4 Direct Mode で Combo を参照する

Direct Mode では Combo は参照のみです。現在の ZMK Studio firmware は Combo RPC を公開していないため、実機へ直接読み書きできません。

1. Direct Mode で device を読み込みます。
2. 右側の `Combos` tab を開きます。
3. Firmware keymap 由来の Combo 一覧と詳細を確認します。

Combo を変更する場合は Firmware Mode で `KobitoKey.keymap` を編集し、firmware を build + flash してください。

### 5.5 Direct Mode でトラックボール設定を参照する

Direct Mode では Trackball は参照のみです。現在の KobitoKey firmware は Trackball 設定を Studio RPC で runtime 保存できません。

1. Direct Mode で device を読み込みます。
2. `Trackball` tab を開きます。
3. Firmware overlay 由来の Trackball 設定を確認します。

Trackball を変更する場合は、Firmware Mode で左右 overlay を更新して build + flash してください。

### 5.6 Timing tab について

Direct Mode の `Timing` tab は未対応表示のみです。tapping term や hold-tap timing などを確実に反映したい場合は Firmware Mode で該当ファイルを編集し、firmware を build してください。

## 6. 目的別レシピ

### キーを 1 つだけ変えたい

Direct Mode が使えるなら Direct Mode で device を読み込み、対象 key を選んで `実機へ書き込み` します。

おすすめ手順:

1. `Direct` を選びます。
2. USB で接続して読み込みます。
3. layer を選びます。
4. 中央の key を選びます。
5. 右側で `&kp` などのキー動作を選びます。
6. `書き込み予定に追加` を押します。
7. `実機へ書き込み` を押します。

ZMK Studio 対応 firmware がない、または Direct Mode で未対応のキー動作を使う場合は Firmware Mode で変更してから build + flash します。

### Combo を追加したい

確実に設定したい場合は Firmware Mode を使います。

おすすめ手順:

1. `Firmware` を選びます。
2. project を読み込みます。
3. `Combos` を開きます。
4. `追加` で Combo を作ります。
5. key grid で同時押し key を選びます。
6. Combo の動作と timeout を設定します。
7. `Diff` を確認します。
8. ブラウザ版は `Commit & Build`、Tauri 版は保存して build します。
9. build + UF2 書き込みで反映します。

Combo は Direct Mode では参照のみです。追加や変更は Firmware Mode を使ってください。

### トラックボール感度を調整したい

まず Firmware Mode で設定する方法を推奨します。左右 overlay に設定が残るため、あとから見直しやすくなります。

おすすめ手順:

1. `Firmware` を選びます。
2. project を読み込みます。
3. `Trackball` を開きます。
4. CPI または感度を 1 項目だけ変更します。
5. `Diff` を確認します。
6. ブラウザ版は `Commit & Build`、Tauri 版は保存して build し、UF2 書き込みをします。
7. 実機で動きを確認し、必要なら再調整します。

Trackball は Direct Mode では参照のみです。変更する場合は Firmware Mode を使ってください。

### GitHub Actions build から書き込みまで行いたい

ブラウザ版では Firmware Mode の `Build & Flash` ボタンから GitHub に接続し、repository を読み込んで変更後に `Commit & Build` を押します。build 成功後に artifact を取得し、左右それぞれで reset UF2、firmware UF2 の順に bootloader volume へ保存します。

Tauri 版では Firmware Mode で設定を保存し、`KobitoKey_QWERTY` 側で commit / push します。その後、KobitoKey Studio の `Build & Flash` ボタンから build を起動し、artifact を download して、左右 UF2 を順番に bootloader volume へコピーします。

### ブラウザ版で試した変更を正式反映したい

ブラウザの Direct Mode で実機へ直接書いた変更は、`KobitoKey_QWERTY` ファイルへ自動では戻りません。

設定をファイルとして残し、次回 firmware build でも同じ状態を残したい場合は、Firmware Mode の keymap や overlay に同じ設定を反映してください。ブラウザ版では GitHub repository に commit として残せます。

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
| keymap | layer ごとのキー動作と Combo を含む設定 |
| layer | キーボードの面。通常 layer、記号 layer、数字 layer などを切り替えて使う |
| キー動作(ZMK 構文) | key に割り当てる動作。例: `&kp A`、`&mo 1` |
| behavior | ZMK の動作種別。`&kp`、`&lt`、`&mt` など |
| Combo | 複数 key の同時押しで別の動作を発火する設定 |
| overlay | hardware や左右 half ごとの設定を書くファイル |
| CPI | トラックボール sensor の基本感度 |
| UF2 | bootloader volume にコピーして firmware を書き込むファイル |
| bootloader mode | UF2 書き込み用の volume として keyboard half が mount される状態 |
| artifact | GitHub Actions build が生成する成果物 |
| ZMK Studio | 対応 firmware に接続して keymap などを直接読み書きする仕組み |

## 7. トラブルシューティング

### `Firmware` トグルが押せない

PC の Chrome / Edge で開いているか確認してください。スマホブラウザでは未対応画面になります。ローカル開発中に古い画面が残る場合は、ページを再読み込みしてください。

### `読み込み失敗` になる

ブラウザ版では GitHub repository URL、branch、token/OAuth scope を確認してください。Tauri 版では、指定したフォルダが `KobitoKey_QWERTY` のルートか確認してください。少なくとも次のファイルが存在する必要があります。

```txt
config/KobitoKey.keymap
config/boards/shields/KobitoKey/KobitoKey_left.overlay
config/boards/shields/KobitoKey/KobitoKey_right.overlay
```

ブラウザ版の GitHub エラーには `次の操作:` が表示されます。401 は再接続または token の入力、403 は repository 書き込み権限と Actions 実行権限、404 は repository / branch / managed firmware file path / private repository のアクセス権を確認してください。rate limit の場合は時間を置いてから再試行します。

### Direct Mode で device が見つからない

- USB ケーブルが data 通信対応か確認します。
- ZMK Studio 対応 firmware が入っているか確認します。
- Tauri 版では `検出` を押して候補 port を再取得します。
- ブラウザ版では Chrome/Edge を使い、`127.0.0.1`、`localhost`、または HTTPS から開きます。
- ブラウザの permission picker で正しい device を選びます。

### USB port を開けない

`Failed to open the serial port` や `in use by another process` が出る場合は、別のタブ、Chrome の前回接続、または他のアプリが KobitoKey の serial port を掴んでいる可能性があります。

- 他の KobitoKey Studio タブを閉じます。
- 接続済み画面があれば `切断` を押します。
- USB を抜き差しします。
- まだ失敗する場合は Chrome を完全終了して再起動します。
- Chrome のサイト設定から serial port permission を削除し、再度 device を選び直します。

### Direct 書き込みに失敗する

- device を読み込んでから書き込んでいるか確認します。
- 選択中 layer と key position が正しいか確認します。
- Direct Mode 対応キー動作か確認します。
- 独自 behavior や未対応キー動作は Firmware Mode で編集します。

### Combo が Direct Mode で編集できない

現在の ZMK Studio firmware は Combo RPC を公開していないため、Direct Mode では Combo を編集できません。Firmware Mode で `KobitoKey.keymap` の Combo を編集してください。

### Trackball が Direct Mode で保存できない

firmware に Trackball RPC が含まれていません。Firmware Mode の `Trackball` で overlay を編集し、build + flash してください。

### GitHub Actions build が起動できない

- ブラウザ版では GitHub OAuth device flow の `repo` scope、または fine-grained token の Contents write / Actions write 権限を確認します。
- Tauri 版では `gh auth login` が済んでいるか確認します。
- Tauri 版では `KobitoKey_QWERTY` の root path が正しいか確認します。
- Firmware repository URL が正しい GitHub repository を指しているか確認します。
- GitHub Actions の `build.yml` workflow が対象リポジトリに存在するか確認します。
- workflow を実行できる GitHub 権限があるか確認します。
- ブラウザ版で commit SHA が表示されている場合は、`Build 起動` で workflow dispatch だけを再試行します。

### UF2 volume が表示されない

- keyboard half が bootloader mode に入っているか確認します。
- macOS の `/Volumes` に bootloader volume が mount されているか確認します。
- ブラウザ版では UF2 保存時の directory picker で bootloader volume を選びます。
- Tauri 版では `UF2 / Volume 更新` を押して再スキャンします。
- left / right のどちらを接続しているか確認します。

## 8. 関連ドキュメント

開発時の起動コマンド、公開 URL、Cloudflare Pages、GitHub Pages の更新方法は [Deployment](../deployment/) に集約しています。
