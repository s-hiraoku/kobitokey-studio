---
layout: guide
title: Firmware Mode
permalink: /firmware-mode/
eyebrow: ⚙ じっくり作り込む
lead: 設定ファイルを編集してファームウェアを作り直し、実機に書き込むモードです。キー・Combo・トラックボールを含むすべての設定を扱えて、変更がファイルとして残ります。
description: KobitoKey Studio の Firmware Mode の使い方。ブラウザで編集してビルド・書き込みする方法と、すでにある artifact を書き込むだけの方法の両方を解説します。
steps:
  - { id: "二つの使い方", label: "2 つの使い方" }
  - { id: "読み込む", label: "読み込む" }
  - { id: "編集する", label: "編集する" }
  - { id: "diff-で確認する", label: "Diff で確認" }
  - { id: "build--flash", label: "Build & Flash" }
  - { id: "uf2-を書き込む", label: "UF2 を書き込む" }
next:
  title: Direct Mode を見る
  url: /direct-mode/
  desc: ビルドせずに実機へその場でキーを書き込む方法
---

Firmware Mode が編集するのは、`KobitoKey_QWERTY` リポジトリの 3 ファイルです。ブラウザ版ではローカルに clone する必要はなく、GitHub から直接読み書きします。

<div class="table-scroll" markdown="1">

| 種類 | 対象ファイル |
| --- | --- |
| キー・Combo | `config/KobitoKey.keymap` |
| 左側トラックボール | `config/boards/shields/KobitoKey/KobitoKey_left.overlay` |
| 右側トラックボール | `config/boards/shields/KobitoKey/KobitoKey_right.overlay` |

</div>

<div class="callout">
  <div>公式リポジトリに書き込み権限がない場合は、GitHub 上で <code>KobitoKey_QWERTY</code> を fork し、その fork を <strong>Firmware repository</strong> に指定してください。</div>
</div>

## 2 つの使い方
{: #二つの使い方}

Firmware Mode には、状況に合わせた **2 つの入口** があります。どちらに進んでも、最後の「実機へ UF2 を書き込む」手順は共通です。

<div class="routes">
  <div class="route">
    <span class="route-num">A</span>
    <h3>ブラウザで編集して書き込む</h3>
    <p>アプリ上でキーや Combo を編集し、GitHub に commit して GitHub Actions でビルド。出来た artifact をそのまま取得して実機に書き込みます。<strong>一番ふつうの流れ</strong>です。</p>
    <p class="muted">読み込む → 編集する → Diff → Commit &amp; Build → Artifact 取得 → 書き込み</p>
  </div>
  <div class="route">
    <span class="route-num">B</span>
    <h3>できあがった artifact を書き込むだけ</h3>
    <p>すでにどこかで作った artifact (zip) や UF2 ファイルが手元にあるなら、編集やビルドを飛ばして<strong>書き込みだけ</strong>を実行できます。別の PC で作ったもの、GitHub Actions から手動 download したものでも OK です。</p>
    <p class="muted">フォルダを選ぶ → 左右に分類 → 書き込み</p>
  </div>
</div>

<div class="callout tip">
  <div><strong>ルート B はこんなときに便利。</strong> 「編集はもう済んでいて書き込みだけやり直したい」「ビルドは別の人がやって artifact だけもらった」「GitHub に再接続せずに焼き直したい」——どれも、展開済みの artifact フォルダさえあれば Flash だけ進められます。</div>
</div>

---

以下は **ルート A**(ブラウザで編集 → ビルド → 書き込み)を順に追う手順です。**ルート B** だけ使いたい場合は <a href="#artifact-だけ書き込む-ルート-b">「artifact だけ書き込む」</a> へ飛んでください。

## 読み込む
{: #読み込む}

<div class="steps">
  <div class="step"><div>
    <h3>Firmware を選ぶ</h3>
    <p>上部のモード切り替えで <strong>Firmware</strong> を選びます。</p>
  </div></div>
  <div class="step"><div>
    <h3>Build &amp; Flash を開く</h3>
    <p><strong>Build &amp; Flash</strong> ボタンを押し、<code>Firmware repository</code>(<code>owner/repo</code> または GitHub URL)と <code>Branch</code> を入力します。branch が空だと読み込み・commit・build に進めません。</p>
  </div></div>
  <div class="step"><div>
    <h3>GitHub に接続する</h3>
    <p><strong>GitHub で接続</strong>(OAuth device flow)または <strong>GitHub token</strong> で接続します。新規タブが開かない場合は、画面の <code>GitHub 認証を開く</code> リンクから認証します。</p>
  </div></div>
  <div class="step"><div>
    <h3>読み込む</h3>
    <p><strong>GitHub から読み込み</strong> を押すと keymap と overlay を読み込みます。読み込めたら <code>編集に戻る</code> で編集画面へ。</p>
  </div></div>
</div>

<div class="callout">
  <div>token はブラウザのメモリ上だけで使い、保存しません。fine-grained token を使う場合は、対象リポジトリに <strong>Contents write</strong> と <strong>Actions write</strong> を付けてください。</div>
</div>

## 編集する
{: #編集する}

読み込むと、左に **layer 一覧**、中央に **KobitoKey の物理レイアウト**、右に **選択中キーの編集パネル** が並びます。基本操作は「左で layer を選ぶ → 中央で key を選ぶ → 右で設定する」です。

### キー動作

<div class="steps">
  <div class="step"><div><h3>layer を選ぶ</h3><p>左の layer 一覧から編集したい layer を選びます。</p></div></div>
  <div class="step"><div><h3>key を選ぶ</h3><p>中央のキーボード図で変更したい key をクリックします。</p></div></div>
  <div class="step"><div><h3>動作を選ぶ</h3><p>右の動作エディタで、keycode・layer・modifier・mouse button などを選びます。</p></div></div>
  <div class="step"><div><h3>反映する</h3><p><strong>選択キーに反映</strong> を押します。中央の表示と右の preview が変わります。</p></div></div>
</div>

layer 一覧の上のボタンで layer を追加・複製できます。削除は番号参照のずれを防ぐため最後の layer だけ対応し、キー動作や Combo の `layers` から参照されている layer は削除できません。

<div class="table-scroll" markdown="1">

| やりたいこと | ZMK 構文 |
| --- | --- |
| `A` を入力する | `&kp A` |
| 押している間だけ layer 1 | `&mo 1` |
| tap で Space、hold で layer 1 | `&lt 1 SPACE` |
| tap で Esc、hold で Left Control | `&mt LCTRL ESC` |
| 何もしない key | `&none` |
| 下の layer を透過する | `&trans` |

</div>

<div class="callout tip">
  <div><code>&amp;none</code> は押しても何もしません。<code>&amp;trans</code> はその layer では定義せず、下の layer の同じ位置の動作を使います。似ていますが意味が違うので取り違えに注意してください。</div>
</div>

### Combo

<div class="steps">
  <div class="step"><div><h3>Combos を開く</h3><p>中央下部の <strong>Combos</strong> タブを開きます。</p></div></div>
  <div class="step"><div><h3>追加・選択する</h3><p>既存 Combo を選ぶか <strong>追加</strong> を押します。</p></div></div>
  <div class="step"><div><h3>同時押しを決める</h3><p>1〜40 の key grid から、同時押しする key position を 2 つ以上選びます。中央の Combo overlay で位置関係を確認できます。</p></div></div>
  <div class="step"><div><h3>動作と timeout</h3><p>成立時の動作・有効 layer・<code>timeoutMs</code> を設定し、<strong>Combo の編集を保存</strong> を押します。</p></div></div>
</div>

`timeoutMs` は短いほど誤爆しにくく、長いほど成立しやすくなります。まずは 40〜60ms 程度から試し、実際のタイピングで誤爆しないか確認してください。

### トラックボール

<div class="steps">
  <div class="step"><div><h3>Trackball を開く</h3><p>中央下部の <strong>Trackball</strong> タブを開きます。</p></div></div>
  <div class="step"><div><h3>値を確認する</h3><p>CPI・cursor 感度・scroll 感度・gesture threshold などの現在値を確認します。</p></div></div>
  <div class="step"><div><h3>変更して保存</h3><p>変更したい値を入力し、<strong>トラックボール編集を保存</strong> を押します。左右の overlay に保存されます。</p></div></div>
</div>

<div class="callout warn">
  <div>一度に大きく変えると原因を切り分けにくくなります。まずは <strong>1 項目ずつ</strong> 変更して、ビルド・書き込み後に実機で確認してください。</div>
</div>

## Diff で確認する
{: #diff-で確認する}

`Diff` タブで `KobitoKey.keymap`・左 overlay・右 overlay の変更行を確認します。保存前に次を見ておくと事故を防げます。

- 変更した覚えのない layer が変わっていないか
- left / right のどちらの overlay が変わったか
- Combo の key position が意図した位置か
- ZMK 直接入力に typo がないか、`&none` と `&trans` を取り違えていないか

問題なければ `Build & Flash` で **Diff 確認済み** を押します。変更を破棄したい場合は **編集をリセット** で読み込み時点へ戻せます。

<div class="callout">
  <div>ブラウザ版では <strong>Commit &amp; Build</strong> を押すまで GitHub リポジトリは更新されません。それまでの編集はすべてブラウザ内だけにあります。</div>
</div>

## Build & Flash
{: #build--flash}

### ビルドする(ルート A)

<div class="steps">
  <div class="step"><div><h3>Diff 確認済み</h3><p><strong>Diff 確認済み</strong> を押します。</p></div></div>
  <div class="step"><div><h3>Commit &amp; Build</h3><p><strong>Commit &amp; Build</strong> を押します。Studio が扱う keymap / overlay の 3 ファイルだけを 1 commit にまとめ、同じ branch の <code>build.yml</code> を起動します。</p></div></div>
  <div class="step"><div><h3>commit を確認</h3><p>画面に commit SHA が出たことを確認します。workflow 起動だけ失敗した場合は <code>Build 起動</code> で再試行できます。</p></div></div>
  <div class="step"><div><h3>Artifact 取得</h3><p>ビルド成功後、<strong>Artifact 取得</strong> を押します。表示中の commit と一致する成功 run か再確認してから取得するので、古いビルドの UF2 を誤って使いにくくなっています。</p></div></div>
</div>

ここでいうビルドは KobitoKey Studio 自体のビルドではなく、**Firmware repository の GitHub Actions ビルド**です。

### artifact だけ書き込む(ルート B)
{: #artifact-だけ書き込む-ルート-b}

編集やビルドを飛ばし、手元の artifact から **書き込みだけ** を行うルートです。`Build & Flash` の **Artifact フォルダから再開**(または Flash パネルの **フォルダを選択**)を使います。

<div class="steps">
  <div class="step"><div><h3>フォルダを用意する</h3><p>GitHub Actions などから取得した artifact zip は<strong>展開</strong>しておきます。あるいは left / reset / right の UF2 を 1 つのフォルダにまとめます。</p></div></div>
  <div class="step"><div><h3>フォルダを選ぶ</h3><p><strong>Artifact フォルダから再開</strong> を押し、その展開済みフォルダを選びます。サブフォルダも再帰的に読み込みます。</p></div></div>
  <div class="step"><div><h3>分類を確認する</h3><p>Studio がフォルダ内の UF2 を <strong>left / reset / right</strong> に分類します。Flash パネルが <code>left OK / reset OK / right OK</code> になれば準備完了です。</p></div></div>
</div>

<div class="callout warn">
  <div><strong>選ぶのは zip ファイルそのものではなく、展開済みフォルダです。</strong> フォルダ再開ではファイル名で分類するため、<code>left</code> / <code>right</code> / <code>reset</code>(または <code>settingsreset</code>)が分かる名前にしてください。manifest にしか side 情報がない artifact は、GitHub の run から <code>Artifact 取得</code> するルート A のほうが確実です。</div>
</div>

### Artifact の中身

取得後、Flash パネルに **3 種類の UF2** が揃っているか確認します。

<div class="table-scroll" markdown="1">

| 必要な UF2 | 役割 |
| --- | --- |
| left UF2 | 左側のファームウェア |
| right UF2 | 右側のファームウェア |
| reset UF2 | Direct Mode / ZMK Studio の保存設定を消す |

</div>

artifact に `manifest.json` または `firmware-manifest.json` があれば、Studio はそれを優先して left / right / reset を判定します。無ければ UF2 のファイル名から推定します。3 種類が揃わないと書き込みボタンは有効になりません。

## UF2 を書き込む
{: #uf2-を書き込む}

KobitoKey の firmware は左右別々に書き込みます。ブラウザ版は Chrome のフォルダ選択で bootloader volume を選び、UF2 を直接コピーします(Finder での手動コピーは通常ルートではありません)。

<div class="callout danger">
  <div><strong>必ず reset UF2 を先に書き込みます。</strong> Direct Mode / ZMK Studio で保存した設定は ZMK の永続設定に残り、通常のファームウェアを焼いても <code>.keymap</code> の変更より優先されることがあります。reset UF2 を先に入れることで、編集した内容が正しく反映されます。</div>
</div>

<div class="steps">
  <div class="step"><div><h3>左を bootloader に</h3><p>左側を USB で接続し、bootloader mode に入れます。</p></div></div>
  <div class="step"><div><h3>Left reset</h3><p><strong>Left reset を直接コピー</strong> を押し、<code>INFO_UF2.TXT</code> がある左側の bootloader volume を選びます。</p></div></div>
  <div class="step"><div><h3>Left firmware</h3><p>reset 後、左側をもう一度 bootloader mode に入れ、<strong>Left firmware を直接コピー</strong> を実行します。</p></div></div>
  <div class="step"><div><h3>右も同じ手順で</h3><p>右側へ USB を差し替え、<strong>Right reset を直接コピー</strong> → もう一度 bootloader mode → <strong>Right firmware を直接コピー</strong> の順に進めます。</p></div></div>
</div>

書き込む前に、接続中の half とボタンの Left / Right が合っていること、選んだ volume に `INFO_UF2.TXT` があること、表示中の `artifact <name> #<id>` が想定したビルドと一致していることを確認してください。

<div class="callout tip">
  <div>左右両方の bootloader volume が同時に表示される場合は、ケーブルを差し替えずに順番に書き込めます。</div>
</div>
