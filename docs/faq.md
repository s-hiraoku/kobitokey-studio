---
layout: guide
title: 困ったとき
permalink: /faq/
eyebrow: ❓ トラブルシューティング
lead: つまずきやすいポイントと、その場で確認できるチェック項目をまとめました。症状から探してください。
description: KobitoKey Studio で接続できない・読み込めない・書き込めないときの確認項目をまとめた FAQ。
next:
  title: Firmware Mode に戻る
  url: /firmware-mode/
  desc: ファイルを編集してビルド・書き込みする流れ
---

<div class="faq" markdown="0">

<details>
<summary>Firmware トグルが押せない / 画面が出ない</summary>
<ul>
<li>PC の <strong>Chrome / Edge</strong> で開いているか確認します。スマホブラウザは未対応画面になります。</li>
<li>ローカル開発中に古い画面が残る場合は、ページを再読み込みします。</li>
</ul>
</details>

<details>
<summary>GitHub から読み込めない（読み込み失敗）</summary>
<ul>
<li>リポジトリ URL・branch・OAuth/token の権限・private リポジトリへのアクセス権を確認します。</li>
<li>少なくとも <code>config/KobitoKey.keymap</code>、左右の <code>*.overlay</code> が存在する必要があります。</li>
<li>GitHub エラーには「次の操作」が表示されます。<strong>401</strong> は再接続/token 入力、<strong>403</strong> は Contents/Actions の書き込み権限、<strong>404</strong> はリポジトリ/branch/path/アクセス権、<strong>rate limit</strong> は時間を置いて再試行。</li>
</ul>
</details>

<details>
<summary>Commit &amp; Build が押せない</summary>
<p>GitHub 接続・リポジトリ/branch・読み込み済みファイル・変更の有無・<code>Diff 確認済み</code> を押したか、を順に確認します。</p>
</details>

<details>
<summary>Artifact 取得が押せない / 取得できない</summary>
<ul>
<li>対象 commit の GitHub Actions ビルドが<strong>成功</strong>しているか確認します。</li>
<li>artifact が存在しない・期限切れ・zip に UF2 が含まれない場合は失敗として止まります。<code>Build 起動</code> で新しい run を作り、Actions の artifact upload 設定とビルド出力を確認してください。</li>
</ul>
</details>

<details>
<summary>GitHub Actions ビルドが起動できない</summary>
<ul>
<li>OAuth device flow の <code>repo</code> scope、または fine-grained token の Contents write / Actions write を確認します。</li>
<li>Firmware repository URL が正しいリポジトリを指しているか、<code>build.yml</code> が対象リポジトリに存在するか確認します。</li>
<li>commit SHA が表示済みなら、<code>Build 起動</code> で workflow dispatch だけ再試行できます。</li>
</ul>
</details>

<details>
<summary>書き込みボタンが押せない</summary>
<p>left / reset / right の UF2 が <strong>3 種類すべて</strong>揃っているか確認します。ファイル名から分類できない、reset UF2 が無い、左右で同じファイル名になっている場合は有効になりません。</p>
</details>

<details>
<summary>bootloader volume が選べない / 表示されない</summary>
<ul>
<li>キーボードの half が <strong>bootloader mode</strong> に入っているか確認します。</li>
<li>選ぶ volume に <code>INFO_UF2.TXT</code> があるか確認します。</li>
<li>reset UF2 を書くと bootloader volume が一度消えることがあります。<strong>もう一度 bootloader mode に入れて</strong>から firmware UF2 を書き込んでください。</li>
</ul>
</details>

<details>
<summary>Direct Mode でデバイスが見つからない</summary>
<ul>
<li>USB ケーブルが<strong>データ通信対応</strong>か確認します(充電専用ケーブルでは見つかりません)。</li>
<li>実機に <strong>ZMK Studio 対応ファームウェア</strong>が入っているか確認します。</li>
<li>Chrome / Edge で <code>127.0.0.1</code>・<code>localhost</code>・HTTPS から開いているか確認します。</li>
<li>ブラウザの選択ダイアログで正しいデバイスを選びます。Bluetooth で見つからない場合は USB を使います。</li>
</ul>
</details>

<details>
<summary>USB ポートを開けない（in use / Failed to open）</summary>
<p>別のタブ・前回の接続・他のアプリがシリアルポートを掴んでいる可能性があります。</p>
<ul>
<li>他の KobitoKey Studio タブを閉じます。</li>
<li>接続済み画面があれば <code>切断</code> を押します。</li>
<li>USB を抜き差しします。</li>
<li>それでも失敗するなら Chrome を完全終了して再起動します。</li>
<li>Chrome のサイト設定からシリアルポート権限を削除し、選び直します。</li>
</ul>
</details>

<details>
<summary>Direct の書き込みが反映されない</summary>
<ul>
<li>device を読み込んでから書き込んでいるか確認します。</li>
<li>書き込み対象の layer と key position が正しいか確認します。</li>
<li><a href="{{ '/direct-mode/#扱える設定' | relative_url }}">Direct Mode 対応のキー動作</a>か確認します。独自 behavior は Firmware Mode で編集します。</li>
</ul>
</details>

<details>
<summary>Combo / トラックボールが Direct Mode で変更できない</summary>
<p>環境によっては Combo は参照のみ、トラックボールは常に参照のみです。確実に変更するには <a href="{{ '/firmware-mode/' | relative_url }}">Firmware Mode</a> で <code>KobitoKey.keymap</code> や overlay を編集し、ビルド・書き込みしてください。</p>
</details>

<details>
<summary>保存時にファイルがダウンロードされてしまう（Tauri 版）</summary>
<p>フォルダのハンドルが無い状態です。<code>参照…</code> でフォルダを選び直すと、直接保存に切り替わります。</p>
</details>

</div>

---

それでも解決しない場合は、[Firmware Mode]({{ '/firmware-mode/' | relative_url }}) と [Direct Mode]({{ '/direct-mode/' | relative_url }}) の手順を最初から見直すか、[GitHub の Issue](https://github.com/{{ site.github_username }}/kobitokey-studio/issues) で状況(使ったモード・ブラウザ・エラーメッセージ)を添えて相談してください。
