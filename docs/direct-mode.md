---
layout: guide
title: Direct Mode
permalink: /direct-mode/
eyebrow: ⚡ すぐに試す
lead: ZMK Studio 対応ファームウェアが入った KobitoKey に接続して、キー動作をその場で実機へ書き込むモードです。ビルドも UF2 書き込みも要らず、数秒で反映できます。
description: KobitoKey Studio の Direct Mode の使い方。USB / Bluetooth での接続、キー動作の書き込み、Firmware Mode との違いを解説します。
steps:
  - { id: "向いている場面", label: "向いている場面" }
  - { id: "接続する", label: "接続する" }
  - { id: "キーを書き込む", label: "キーを書き込む" }
  - { id: "扱える設定", label: "扱える設定" }
  - { id: "firmware-に残す", label: "Firmware に残す" }
next:
  title: 困ったときは
  url: /faq/
  desc: 接続できない・書き込めないときのチェック項目
---

Direct Mode は、ブラウザの Web Serial / Web Bluetooth で実機につなぎ、ZMK Studio API を通じて設定を**実機の不揮発メモリへ直接保存**します。Firmware Mode のように「ファイルを編集 → ビルド → 焼く」というステップが要らないのが特徴です。

<figure>
  <img src="{{ '/assets/img/direct-landing.png' | relative_url }}" alt="KobitoKey Studio の Direct Mode 接続画面。接続手順の 1・2・3 と、USB 接続ボタン、この環境でできることの一覧が表示されている。" width="1440" height="900" loading="lazy">
  <figcaption>Direct Mode の接続画面。USB をつなぎ「USB で接続」を押すところから始まります。</figcaption>
</figure>

## 向いている場面
{: #向いている場面}

<div class="callout tip">
  <div><strong>Direct Mode は「1 キーだけ素早く試したい」ときの近道です。</strong> 長く使う設定をきちんと残したいなら、最終的には <a href="{{ '/firmware-mode/' | relative_url }}">Firmware Mode</a> のファイルにも反映しておくのがおすすめです。</div>
</div>

<div class="table-scroll" markdown="1">

| やりたいこと | Direct Mode で |
| --- | --- |
| キーを 1 個だけ変えて試す | ✅ 得意 |
| 配列を試行錯誤しながら詰める | ✅ ビルド待ちがないので速い |
| Combo を追加・編集する | ⚠ 環境によっては未対応。<a href="{{ '/firmware-mode/' | relative_url }}">Firmware Mode</a> が確実 |
| トラックボールを調整する | ⛔ 参照のみ。<a href="{{ '/firmware-mode/' | relative_url }}">Firmware Mode</a> で変更 |
| tapping term などの timing | ⛔ Firmware Mode で変更 |

</div>

<div class="callout">
  <div>Direct Mode で扱える設定は、実機ファームウェアの ZMK Studio RPC と Studio 側の実装に依存します。画面の「この環境でできること」に、いま接続している環境での <strong>書込可 / 参照のみ / 未対応</strong> が表示されます。未対応の設定は Firmware Mode で編集してください。</div>
</div>

## 接続する
{: #接続する}

<div class="callout warn">
  <div><strong>USB 接続を推奨します。</strong> Bluetooth は実験的対応で、通常のキーボード接続ではなく「ZMK Studio 用」として表示されるデバイスが見つかる場合だけ使えます。見つからない・不安定なときは USB を使ってください。</div>
</div>

<div class="steps">
  <div class="step is-direct"><div>
    <h3>USB でつなぐ</h3>
    <p>まず USB の<strong>データ通信対応</strong>ケーブルで KobitoKey を PC につなぎます。</p>
  </div></div>
  <div class="step is-direct"><div>
    <h3>Direct を選ぶ</h3>
    <p>上部のモード切り替えで <strong>Direct</strong> を選びます(ブラウザ版は最初から Direct です)。</p>
  </div></div>
  <div class="step is-direct"><div>
    <h3>接続方法を選んで接続</h3>
    <p>接続パネルの「接続方法」で <strong>USB</strong> を選び、<strong>USB で接続</strong> を押します。ブラウザのデバイス選択ダイアログが開くので KobitoKey を選びます。</p>
  </div></div>
  <div class="step is-direct"><div>
    <h3>接続完了</h3>
    <p>接続後、ヘッダにデバイス名のチップ・保存状態・<code>再読み込み</code> / <code>切断</code> が表示され、中央に実機の keymap が出ます。</p>
  </div></div>
</div>

<div class="callout">
  <div>ブラウザはデバイスを事前に一覧表示できません。「検出」のような操作はなく、<strong>接続ボタンを押した時点でブラウザの選択ダイアログが開く</strong>動きになります。</div>
</div>

## キーを書き込む
{: #キーを書き込む}

<div class="steps">
  <div class="step is-direct"><div><h3>layer と key を選ぶ</h3><p>layer を選び、中央のキーボードで key を選びます。</p></div></div>
  <div class="step is-direct"><div><h3>動作を確認する</h3><p>右の <strong>Key Config</strong> で、現在の動作と書き込み予定の動作を確認します。</p></div></div>
  <div class="step is-direct"><div><h3>予定に追加</h3><p><strong>書き込み予定に追加</strong> を押します。複数のキーをまとめて予定に入れられます。</p></div></div>
  <div class="step is-direct"><div><h3>実機へ書き込み</h3><p><strong>実機へ書き込み</strong> を押すと実機に保存され、keymap が再読み込みされます。</p></div></div>
</div>

保存状態が `自動保存済み` なら未保存の変更はありません。`未保存あり` の場合は実機側に保存前の変更が残っています。

## 扱える設定
{: #扱える設定}

Direct Mode で書き込める主なキー動作は次のとおりです。ここに無い動作や独自 behavior は Firmware Mode で編集してください。

<div class="table-scroll" markdown="1">

| ZMK 構文 | 用途 |
| --- | --- |
| `&kp KEY` | 通常 key press |
| `&kt KEY` | key toggle |
| `&lt LAYER KEY` | layer tap |
| `&mt HOLD TAP` | mod tap / hold tap |
| `&sk KEY` / `&sl LAYER` | sticky key / sticky layer |
| `&mo LAYER` / `&to LAYER` / `&tog LAYER` | momentary / move / toggle layer |
| `&bt COMMAND VALUE` | Bluetooth 操作 |
| `&mkp` / `&mmv` / `&msc VALUE` | mouse button / move / scroll |
| `&trans` / `&none` | transparent / none |
| `&caps_word` / `&key_repeat` / `&gresc` | caps word / key repeat / grave escape |
| `&studio_unlock` / `&sys_reset` / `&bootloader` / `&soft_off` | Studio・システム系 |

</div>

## Firmware に残す
{: #firmware-に残す}

<div class="callout warn">
  <div><strong>Direct Mode で書いた変更は、リポジトリのファイルへは自動で戻りません。</strong> 次回ファームウェアを作り直したときに同じ状態を残したいなら、Firmware Mode の keymap にも同じ設定を入れておく必要があります。</div>
</div>

Direct Mode で device を読み込むと、実機の keymap と Firmware Mode 側の keymap のキー差分を **Direct summary** で確認できます。差分行の `このキー差分を取り込む`(またはパネル上部の `キー差分を Firmware に取り込む`)を押すと、Direct 側の差分を Firmware keymap に取り込めます。ファイルへの保存・commit は Firmware Mode 側で実行します。
