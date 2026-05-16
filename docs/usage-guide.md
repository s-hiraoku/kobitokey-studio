---
layout: page
title: KobitoKey Studio 使い方ガイド
permalink: /usage-guide/
---

# KobitoKey Studio 使い方ガイド

このガイドのゴールは、ユーザが自分で KobitoKey Studio を起動し、目的に合うモードを選び、キーマップ、Combo、トラックボール設定、Firmware build、UF2 書き込みまで進められるようにすることです。

## まず結論

KobitoKey Studio では、最初に `Firmware Mode` と `Direct Mode` のどちらを使うかを選びます。

| 迷っている内容 | 選ぶもの | 理由 |
| --- | --- | --- |
| 初めて設定する | Firmware Mode | 変更がファイルに残り、あとから diff で確認できるため |
| Combo やトラックボールを確実に設定したい | Firmware Mode | Direct Mode 未対応の設定も扱えるため |
| キーを 1 個だけ素早く変更したい | Direct Mode | ビルドと UF2 書き込みなしで実機へ保存できるため |
| ブラウザで試している | Direct Mode は Chrome/Edge のみ | Web Serial / Web Bluetooth が必要なため |
| GitHub Actions から UF2 まで進めたい | Tauri版 + Firmware Mode | ローカルファイル保存、artifact 取得、UF2 コピーが必要なため |

迷った場合は `Firmware Mode` を選んでください。Firmware Mode は `KobitoKey_QWERTY` の設定ファイルを編集し、ファームウェアを作り直して反映します。Direct Mode は、ZMK Studio 対応 firmware が入った実機へ、対応済みの設定だけを直接保存するための高速な編集モードです。

## このガイドの読み方

最短で設定したい場合は、次の順番で読んでください。

1. [事前準備](#1-事前準備)
2. [モード選択の考え方](#2-モード選択の考え方)
3. ファイル編集で反映するなら [Firmware Mode で設定する](#3-firmware-mode-で設定する)
4. 実機へ直接反映するなら [Direct Mode で設定する](#5-direct-mode-で設定する)
5. 書き込みで迷ったら [トラブルシューティング](#7-トラブルシューティング)

## 画面の見方

KobitoKey Studio の画面は、主に 4 つの領域に分かれています。

| 場所 | 役割 |
| --- | --- |
| 上部バー | `Firmware` / `Direct` の切り替え、プロジェクト読み込み、device 読み込み |
| 左側 | layer 一覧、Direct Mode の接続操作 |
| 中央 | 実際の KobitoKey 形状に沿った keymap 表示、Combo overlay、作業 tabs |
| 右側 | 選択中 key の binding、Combo、Trackball、Build/Flash 操作 |

基本操作は「左で layer を選ぶ → 中央で key を選ぶ → 右で設定する」です。

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
| Tauri デスクトップ版 | 実際の設定作業、ファイル保存、ビルド、artifact 取得、UF2 コピー、Direct Combo/Trackball 書き込み |
| ブラウザ版 | UI の確認、fixture の確認、Web Serial / Web Bluetooth を使った Direct key binding 書き込み |

設定作業を最後まで進めるなら、Tauri デスクトップ版を推奨します。ブラウザ版は便利ですが、ローカルファイルへ直接保存できず、GitHub Actions や UF2 コピーも使えません。

### ローカル開発版の起動

ブラウザで UI を確認するだけなら、KobitoKey Studio のリポジトリで次を実行します。

```sh
npm install
npm run dev
```

起動後、`http://127.0.0.1:1420/` を開きます。

Tauri デスクトップ版を使う場合は、Rust と Cargo を用意したうえで次を実行します。

```sh
npm run tauri dev
```

Tauri デスクトップ版では、ローカルファイルの読み書き、GitHub Actions 操作、artifact download、UF2 コピー、Direct Combo/Trackball 書き込みなど、ブラウザだけでは制限される機能を使えます。

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

| 機能 | Tauri デスクトップ版 | ブラウザ版 |
| --- | --- | --- |
| Firmware ファイル読み込み | ローカルフォルダから読み込み | fixture 表示、保存時は download |
| Firmware ファイル保存 | ローカルファイルへ直接保存 | `KobitoKey.keymap` と overlay を download |
| GitHub Actions build | 対応 | 非対応 |
| Artifact download | 対応 | 非対応 |
| UF2 bootloader copy | 対応 | 非対応 |
| Direct USB | 対応 | Chrome/Edge の Web Serial で対応 |
| Direct Bluetooth | 対応環境で利用 | Chrome/Edge の Web Bluetooth で対応 |
| Direct key binding write | 対応 | 対応 |
| Direct Combo write | 対応 | 読み取り表示または未対応 |
| Direct Trackball write | 対応 | 未対応表示 |

ブラウザ版で Direct Mode を使う場合は、Chrome または Edge で `localhost` または HTTPS から開いてください。Web Serial / Web Bluetooth は、通常の `file://` や安全でない HTTP では利用できません。

## 3. Firmware Mode で設定する

### 3.1 プロジェクトを読み込む

1. 上部のモード切り替えで `Firmware` を選びます。
2. `KobitoKey_QWERTY` のローカルフォルダを指定します。
3. `選択` でフォルダ picker を開くか、パスを直接入力します。
4. `読み込み` を押します。

デフォルトの想定パスは次です。

```txt
/Volumes/SSD/ghq/github.com/s-hiraoku/KobitoKey_QWERTY
```

読み込みに成功すると、左側に layer 一覧、中央に KobitoKey の物理レイアウト、右側に選択中キーの編集 panel が表示されます。

### 3.2 キー binding を編集する

1. 左側の layer 一覧から編集したい layer を選びます。
2. 中央のキーボード図で変更したい key をクリックします。
3. 右側の `Binding` panel で binding type を選びます。
4. on-screen picker から keycode、layer、modifier、mouse button、Bluetooth action などを選びます。
5. `反映` を押します。
6. 中央の表示と右側の preview が変わったことを確認します。

Firmware Mode の編集は、押した時点ではまだローカルファイルへ保存されません。画面上の変更を確認してから `保存` を押してください。

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

### 3.4 Combo を編集する

1. Firmware Mode で中央下部または右側の `Combos` を開きます。
2. 既存 Combo を選ぶか、`追加` を押します。
3. `binding` に発火させたい binding を設定します。
4. key grid で 2 つ以上の key position を選びます。
5. `timeoutMs` を設定します。
6. `Combo binding に反映` または保存操作を押して変更を反映します。

Combo の key position は、手入力ではなく画面上の 1-40 の key grid から選べます。実際に押す組み合わせに対応する位置を選び、中央の Combo overlay で位置関係を確認してください。

### 3.5 トラックボール設定を編集する

1. Firmware Mode で `Trackball` を開きます。
2. CPI、cursor 感度、scroll 感度、gesture threshold などを確認します。
3. 変更したい値を入力します。
4. `反映` を押します。

Firmware Mode のトラックボール設定は overlay ファイルへ反映されます。左右で別々に設定値がある項目は、画面の field 名と現在値を確認してから変更してください。

### 3.6 diff を確認して保存する

1. `Diff` を開きます。
2. `KobitoKey.keymap`、左 overlay、右 overlay の変更行を確認します。
3. 内容に問題がなければ、中央上部の `保存` を押します。

Tauri デスクトップ版では、読み込んだ `KobitoKey_QWERTY` のファイルへ直接保存されます。ブラウザ版ではローカルファイルへ直接書き込めないため、変更済みの `KobitoKey.keymap` と overlay ファイルが download されます。

## 4. Firmware を build して UF2 を書き込む

### 4.1 保存後に GitHub Actions build を起動する

1. Firmware Mode で変更を保存します。
2. 必要に応じて `KobitoKey_QWERTY` 側で commit / push します。
3. `Build` または `GitHub Actions` panel を開きます。
4. `build 起動` を押します。
5. `status 更新` で最新 run の状態を確認します。

KobitoKey Studio は `gh workflow run build.yml` と `gh run list` を使って GitHub Actions を操作します。`gh auth login` 済みで、対象リポジトリの workflow を実行できる必要があります。

### 4.2 artifact を取得する

1. GitHub Actions の build が成功したことを確認します。
2. `artifact 取得` を押します。
3. artifact は `KobitoKey_QWERTY/.kobitokey-studio/artifacts/` に保存されます。
4. `UF2 / Volume 更新` を押して、取得済み UF2 と bootloader volume を再スキャンします。

左右それぞれの UF2 が生成されていることを確認してください。ファイル名で left / right を取り違えないようにします。

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

## 5. Direct Mode で設定する

### 5.1 Direct Mode の前提

Direct Mode を使うには、KobitoKey 側に ZMK Studio 対応 firmware が入っている必要があります。Studio RPC が firmware に含まれていない場合、接続できない、読み込めない、または一部設定だけ未対応になります。

Direct Mode は、接続中の device へ設定を保存します。左右分割 keyboard の場合、現在 Studio device として接続している側に対して操作していることを意識してください。

### 5.2 Tauri デスクトップ版で USB 接続する

1. KobitoKey を USB で接続します。
2. 上部のモード切り替えで `Direct` を選びます。
3. `検出` を押します。
4. device candidate が表示されたら対象 port を選びます。
5. `読み込み` を押します。
6. 中央に実機の keymap が表示されます。

読み込み後は、右側の `Binding`、`Combos`、`Trackball`、`Timing` tabs が使えます。未接続の場合は、Direct welcome 画面や左下の接続 panel から USB 接続を開始してください。

### 5.3 ブラウザ版で USB 接続する

1. Chrome または Edge で `http://localhost:1420/` または HTTPS の Pages URL を開きます。
2. `Direct` を選びます。
3. `Connect via USB` を押します。
4. ブラウザの permission picker で KobitoKey を選びます。
5. 接続後、実機 keymap が読み込まれます。

ブラウザは USB device 一覧を事前に列挙できません。`検出` ではなく、接続ボタンで browser permission picker を開く動きになります。

### 5.4 Bluetooth で接続する

Bluetooth Direct は、ZMK Studio service を公開している device が対象です。

Tauri デスクトップ版では `Direct` で Bluetooth 接続を選び、読み込みます。ブラウザ版では Chrome/Edge の Web Bluetooth permission picker から device を選びます。

Bluetooth 接続が不安定な場合や firmware 側の Studio service が見えない場合は、USB Direct を使ってください。設定作業では USB のほうが切り分けしやすくなります。

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

## 6. よくある設定シナリオ

### キーを 1 つだけ変えたい

Direct Mode が使えるなら Direct Mode で device を読み込み、対象 key を選んで `実機へ書き込み` します。ZMK Studio 対応 firmware がない、または Direct Mode で未対応の binding を使う場合は Firmware Mode で変更してから build + flash します。

### Combo を追加したい

Tauri デスクトップ版で実機 Combo RPC が使える場合は Direct Mode の `Combos` から追加できます。ブラウザ版や RPC 未対応 firmware の場合は Firmware Mode の `Combos` で追加し、保存後に build + flash します。

### トラックボール感度を調整したい

Tauri デスクトップ版で Direct Trackball RPC が使える場合は Direct Mode の `Trackball` から保存できます。RPC がない場合や左右 overlay を明示的に管理したい場合は Firmware Mode の `Trackball` で設定し、build + flash します。

### GitHub Actions build から書き込みまで行いたい

Firmware Mode で設定を保存し、`KobitoKey_QWERTY` 側で commit / push します。その後、KobitoKey Studio の `GitHub Actions` panel から build を起動し、artifact を download して、左右 UF2 を順番に bootloader volume へコピーします。

## 7. トラブルシューティング

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

ブラウザ版では Combo RPC が未公開のため、読み取り表示または未対応になる場合があります。Tauri デスクトップ版で試すか、Firmware Mode で `KobitoKey.keymap` の Combo を編集してください。

### Trackball が Direct Mode で保存できない

firmware に Trackball RPC が含まれていない可能性があります。Firmware Mode の `Trackball` で overlay を編集し、build + flash してください。

### GitHub Actions build が起動できない

- `gh auth login` が済んでいるか確認します。
- `KobitoKey_QWERTY` の root path が正しいか確認します。
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
