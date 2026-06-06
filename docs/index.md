---
layout: home
title: ホーム
permalink: /
description: KobitoKey Studio の使い方ガイド。Firmware Mode と Direct Mode の違い、最短の設定手順、トラブル解決をまとめています。
---

<section class="hero">
  <div class="wrap hero-inner">
    <div>
      <p class="eyebrow">KobitoKey Studio ガイド</p>
      <h1>キーマップを、迷わず変える。</h1>
      <p class="lead">KobitoKey のキー配列・Combo・トラックボール・ファームウェアを、PC のブラウザだけでまとめて設定できる専用エディタです。やりたいことに合わせて <strong>2 つのモード</strong> を選ぶだけ。</p>
      <div class="hero-cta">
        <a class="btn btn-primary" href="https://kobitokey-studio.s-hiraoku.workers.dev/" target="_blank" rel="noopener">アプリを開く ↗</a>
        <a class="btn btn-ghost" href="#modes">どっちのモード？</a>
      </div>
    </div>
    <figure class="hero-figure">
      <img src="{{ '/assets/img/firmware-editor.png' | relative_url }}" alt="KobitoKey Studio の Firmware Mode 編集画面。左に layer 一覧、中央にキーボード図、右にキー設定パネルが並ぶ。" width="1440" height="900" loading="eager">
    </figure>
  </div>
</section>

<section class="home-section" id="modes">
  <div class="wrap">
    <h2>まず、2 つのモードから選ぶ</h2>
    <p class="section-lead">KobitoKey Studio の操作は、最初に「<strong>ファームを作り直して反映する</strong>」か「<strong>実機へその場で書く</strong>」かを選ぶところから始まります。</p>

    <div class="modes">
      <a class="mode-card is-firmware" href="{{ '/firmware-mode/' | relative_url }}">
        <span class="mode-badge">⚙ Firmware Mode</span>
        <h3>じっくり作り込む</h3>
        <p class="mode-tag">設定ファイルを編集して、ファームウェアを作り直す</p>
        <ul>
          <li>キー・Combo・トラックボールを<strong>すべて</strong>変更できる</li>
          <li>設定がファイルとして残るので見直しやすい</li>
          <li>ブラウザ上で編集 → GitHub でビルド → 書き込み</li>
          <li>すでにある artifact を取り込んで<strong>書き込みだけ</strong>もできる</li>
        </ul>
        <span class="mode-link">Firmware Mode の使い方 →</span>
      </a>

      <a class="mode-card is-direct" href="{{ '/direct-mode/' | relative_url }}">
        <span class="mode-badge">⚡ Direct Mode</span>
        <h3>すぐに試す</h3>
        <p class="mode-tag">実機に接続して、キー動作をその場で書き込む</p>
        <ul>
          <li>ビルド不要。<strong>数秒</strong>で実機に反映</li>
          <li>USB をつないでキーを選ぶだけ</li>
          <li>キーを 1 個だけ素早く試したいときに最適</li>
          <li>ZMK Studio 対応ファームウェアが必要</li>
        </ul>
        <span class="mode-link">Direct Mode の使い方 →</span>
      </a>
    </div>

    <div class="callout tip">
      <div><strong>迷ったら Firmware Mode。</strong> 設定がファイルに残るので後から見直せて、Direct Mode が扱えない設定もすべてカバーできます。Direct Mode は「とりあえず 1 キーだけ試したい」ときの近道だと考えてください。</div>
    </div>
  </div>
</section>

<section class="home-section">
  <div class="wrap">
    <div class="decide">
      <h2>やりたいこと別・早見表</h2>
      <div class="decide-rows">
        <div class="decide-row"><b>キーを 1 個だけ素早く変えたい</b><span class="pill pill-direct">Direct Mode</span></div>
        <div class="decide-row"><b>キー配列をしっかり作り込みたい</b><span class="pill pill-firmware">Firmware Mode</span></div>
        <div class="decide-row"><b>Combo を追加・編集したい</b><span class="pill pill-firmware">Firmware Mode</span></div>
        <div class="decide-row"><b>トラックボールの感度を変えたい</b><span class="pill pill-firmware">Firmware Mode</span></div>
        <div class="decide-row"><b>設定をファイルとして残したい</b><span class="pill pill-firmware">Firmware Mode</span></div>
        <div class="decide-row"><b>すでにある UF2 / artifact を書き込むだけ</b><span class="pill pill-firmware">Firmware Mode</span></div>
      </div>
    </div>
  </div>
</section>

<section class="home-section">
  <div class="wrap">
    <h2>最短ルート</h2>
    <p class="section-lead">PC の <strong>Chrome / Edge</strong> で <a href="https://kobitokey-studio.s-hiraoku.workers.dev/" target="_blank" rel="noopener">アプリ</a> を開いて始めます。スマホブラウザは未対応です。</p>

    <div class="routes">
      <div class="route">
        <span class="route-num">⚙</span>
        <h3>初めてしっかり設定する</h3>
        <p>Firmware を選び、Build &amp; Flash から GitHub に接続して読み込み → キー・Combo・トラックボールを編集 → Diff 確認 → Commit &amp; Build → artifact 取得 → 左右に reset UF2・firmware UF2 の順で書き込み。</p>
        <p><a href="{{ '/firmware-mode/' | relative_url }}">Firmware Mode を詳しく →</a></p>
      </div>
      <div class="route">
        <span class="route-num">⚡</span>
        <h3>キーを 1 個だけ試す</h3>
        <p>Direct を選び、USB で接続 → layer と key を選ぶ → キー動作を選び「書き込み予定に追加」→「実機へ書き込み」。ビルドは不要で、数秒で反映されます。</p>
        <p><a href="{{ '/direct-mode/' | relative_url }}">Direct Mode を詳しく →</a></p>
      </div>
    </div>
  </div>
</section>

<section class="home-section">
  <div class="wrap">
    <h2>知っておくと早い用語</h2>
    <div class="terms">
      <dl class="term"><dt>keymap</dt><dd>layer ごとのキー動作と Combo を含む設定ファイル。</dd></dl>
      <dl class="term"><dt>layer</dt><dd>キーボードの面。<code>&amp;mo</code> や <code>&amp;lt</code> で一時的に切り替える。</dd></dl>
      <dl class="term"><dt>キー動作 (ZMK 構文)</dt><dd>key に割り当てる動作。例: <code>&amp;kp A</code>、<code>&amp;lt 1 SPACE</code>。</dd></dl>
      <dl class="term"><dt>Combo</dt><dd>複数の key を同時押しすると別の動作を発火する設定。</dd></dl>
      <dl class="term"><dt>overlay</dt><dd>トラックボールなど、左右それぞれのハードウェア寄りの設定。</dd></dl>
      <dl class="term"><dt>UF2</dt><dd>bootloader にコピーして書き込むファームウェアファイル。</dd></dl>
    </div>
  </div>
</section>
