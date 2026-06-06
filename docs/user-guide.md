---
layout: home
title: ユーザガイド
permalink: /user-guide/
description: KobitoKey Studio ユーザガイドの入口。Firmware Mode と Direct Mode の使い方、トラブル解決へのリンクをまとめています。
redirect_to: /
---

<section class="home-section">
  <div class="wrap">
    <p class="eyebrow center">ユーザガイド</p>
    <h2>KobitoKey Studio の使い方</h2>
    <p class="section-lead">やりたいことに合わせて 2 つのモードから選びます。詳しい手順は各ページにまとまっています。</p>

    <div class="modes">
      <a class="mode-card is-firmware" href="{{ '/firmware-mode/' | relative_url }}">
        <span class="mode-badge">⚙ Firmware Mode</span>
        <h3>じっくり作り込む</h3>
        <p class="mode-tag">設定ファイルを編集して、ファームウェアを作り直す</p>
        <ul>
          <li>キー・Combo・トラックボールをすべて変更できる</li>
          <li>ブラウザで編集 → ビルド → 書き込み</li>
          <li>できあがった artifact を書き込むだけもできる</li>
        </ul>
        <span class="mode-link">Firmware Mode の使い方 →</span>
      </a>
      <a class="mode-card is-direct" href="{{ '/direct-mode/' | relative_url }}">
        <span class="mode-badge">⚡ Direct Mode</span>
        <h3>すぐに試す</h3>
        <p class="mode-tag">実機に接続して、キー動作をその場で書き込む</p>
        <ul>
          <li>ビルド不要。数秒で実機に反映</li>
          <li>USB をつないでキーを選ぶだけ</li>
          <li>キーを 1 個だけ試したいときに最適</li>
        </ul>
        <span class="mode-link">Direct Mode の使い方 →</span>
      </a>
    </div>

    <p class="center" style="margin-block-start:1.5rem">
      <a class="btn btn-ghost" href="{{ '/' | relative_url }}">トップページへ</a>
      <a class="btn btn-ghost" href="{{ '/faq/' | relative_url }}">困ったとき</a>
    </p>
  </div>
</section>
