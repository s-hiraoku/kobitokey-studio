import { readFileSync } from "node:fs";

const files = {
  readme: read("README.md"),
  packageJson: read("package.json"),
  releaseCheckRunner: read("scripts/run-browser-firmware-check.mjs"),
  evidenceSelfTest: read("scripts/check-browser-firmware-evidence-self-test.mjs"),
  collectorSelfTest: read("scripts/check-browser-firmware-collector-self-test.mjs"),
  evidenceCollector: read("scripts/collect-browser-firmware-e2e-evidence.mjs"),
  mergeReadiness: read("scripts/check-browser-firmware-merge-readiness.mjs"),
  mergeReadinessSelfTest: read("scripts/check-browser-firmware-merge-readiness-self-test.mjs"),
  productionPreflight: read("scripts/check-browser-firmware-production-preflight.mjs"),
  publicReleaseCheck: read("scripts/check-browser-firmware-public-release.mjs"),
  publicReleaseSelfTest: read("scripts/check-browser-firmware-public-release-self-test.mjs"),
  productionPreflightSelfTest: read("scripts/check-browser-firmware-production-preflight-self-test.mjs"),
  uiSmoke: read("scripts/check-browser-firmware-ui-smoke.mjs"),
  main: read("src/main.tsx"),
  styles: read("src/styles.css"),
  releaseFlow: read("src/lib/firmwareReleaseFlow.ts"),
  releaseFlowTest: read("src/lib/firmwareReleaseFlow.test.ts"),
  githubFirmware: read("src/lib/githubFirmware.ts"),
  githubFirmwareTest: read("src/lib/githubFirmware.test.ts"),
  githubClient: read("src/lib/githubFirmwareClient.ts"),
  githubClientTest: read("src/lib/githubFirmwareClient.test.ts"),
  githubDeviceFlow: read("src/lib/githubDeviceFlow.ts"),
  githubDeviceFlowTest: read("src/lib/githubDeviceFlow.test.ts"),
  session: read("src/lib/browserFirmwareSession.ts"),
  sessionTest: read("src/lib/browserFirmwareSession.test.ts"),
  worker: read("src/worker.ts"),
  workerTest: read("src/worker.test.ts"),
  wranglerConfig: read("wrangler.jsonc"),
  bootloader: read("src/lib/uf2Bootloader.ts"),
  bootloaderTest: read("src/lib/uf2Bootloader.test.ts"),
  keymapParser: read("src/lib/keymapParser.ts"),
  keymapParserTest: read("src/lib/keymapParser.test.ts"),
  directKeymap: read("src/lib/directKeymap.ts"),
  directKeymapTest: read("src/lib/directKeymap.test.ts"),
  releasePlan: read("docs/browser-firmware-release-plan.md"),
  docsConfig: read("docs/_config.yml"),
  docsIndex: read("docs/index.md"),
  docsUserGuide: read("docs/user-guide.md"),
  docsQuickStart: read("docs/quick-start.md"),
  docsUsageGuide: read("docs/usage-guide.md"),
  docsDeployment: read("docs/deployment.md"),
  pagesCi: read(".github/workflows/pages.yml"),
  externalEvidenceCheck: read("scripts/check-browser-firmware-external-evidence.mjs"),
  externalEvidenceTemplate: read("docs/browser-firmware-e2e-evidence.template.json"),
};

const checks = [
  {
    name: "browser firmware integrated check runs this release audit first",
    pass: () =>
      scriptIncludes("check:browser-firmware", "node scripts/run-browser-firmware-check.mjs") &&
      allIncludes(files.releaseCheckRunner, [
        "BROWSER_FIRMWARE_TMP_DIR",
        "process.env.RUNNER_TEMP",
        "tmpdir()",
        "WRANGLER_LOG_PATH",
        "kobitokey-wrangler-logs",
        "BROWSER_FIRMWARE_WORKER_DRY_RUN_OUTDIR",
        "kobitokey-worker-dry-run",
        "scripts/check-browser-firmware-release.mjs",
        "scripts/check-browser-firmware-evidence-self-test.mjs",
        "scripts/check-browser-firmware-collector-self-test.mjs",
        "scripts/check-browser-firmware-merge-readiness-self-test.mjs",
        "scripts/check-browser-firmware-production-preflight-self-test.mjs",
        "scripts/check-browser-firmware-public-release-self-test.mjs",
        "scripts/collect-browser-firmware-e2e-evidence.mjs",
        'run(npmCommand, ["test"])',
        'run(npmCommand, ["run", "build"])',
        'run(npxCommand, ["wrangler", "deploy", "--dry-run", "--outdir", workerDryRunOutDir])',
      ]),
  },
  {
    name: "browser firmware mode can open via URL in browser builds",
    pass: () =>
      allIncludes(files.main, [
        'get("mode") === "firmware" ? "firmware" : "direct"',
        "function initialWorkbenchTab",
        'get("tab")',
        'tab === "trackball" || tab === "build" || tab === "diff" ? tab : "combos"',
      ]),
  },
  {
    name: "GitHub Pages user guide links to app entry points by setting area",
    pass: () =>
      allIncludes(files.docsConfig, ["user-guide.md"]) &&
      allIncludes(files.docsIndex, ["./user-guide/", "設定内容ごとのアプリ入口"]) &&
      allIncludes(files.docsUserGuide, [
        "permalink: /user-guide/",
        "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=combos",
        "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=trackball",
        "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=diff",
        "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=build",
        "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=direct",
        "編集に戻る",
      ]) &&
      allIncludes(files.docsQuickStart, ["../user-guide/", "編集をリセット"]) &&
      allIncludes(files.docsUsageGuide, ["../user-guide/", "編集に戻る"]),
  },
  {
    name: "browser firmware Build & Flash wizard exposes the release controls",
    pass: () =>
      allIncludes(files.main, [
        "BrowserFirmwareReleaseWorkbench",
        "GitHub Commit & Build",
        "Firmware repository",
        "GitHub から読み込み",
        "token を消去",
        "GitHub token をメモリから消去しました",
        "Diff 確認済み",
        "Commit & Build",
        "Build 起動",
        "Artifact 取得",
        "Browser firmware release checks",
        "UF2 → Bootloader",
        "FirmwareWorkbenchActions",
        "Build & Flash ボタンから GitHub repository を読み込みます",
        "firmware 編集を読み込み時点に戻しました",
        '${sideLabel(side)} を書き込み',
        'return side === "left" ? "Left" : "Right"',
        '<span className="button-label">',
        'htmlFor="browser-firmware-repository"',
        'id="browser-firmware-token"',
        'name="browserFirmwareToken"',
        'autoComplete="new-password"',
        'aria-describedby="browser-firmware-token-help"',
        "BrowserFirmwareOperation",
        "beginBrowserFirmwareOperation",
        "browserFirmwareOperationRef",
        "aria-busy={isBusy}",
        'role="status"',
        'aria-live="polite"',
        'aria-atomic="true"',
        "disabled={isBusy || !readiness.canCommit}",
        "disabled={isBusy || !readiness.canDownloadArtifact}",
        "GitHub commit 失敗",
        "endBrowserFirmwareOperation(\"commit-build\")",
      ]),
  },
  {
    name: "browser firmware UI smoke verifies rendered button layout and right-pane deduplication",
    pass: () =>
      scriptIncludes("check:browser-firmware:ui", "node scripts/check-browser-firmware-ui-smoke.mjs") &&
      allIncludes(files.uiSmoke, [
        "BROWSER_FIRMWARE_TMP_DIR",
        "process.env.RUNNER_TEMP",
        "tmpdir()",
        'page.goto(`${BASE_URL}/?mode=firmware`',
        'getByRole("button", { name: "Build & Flash" })',
        "GitHub Commit & Build",
        "inspectFirmwareActionButtons",
        "Build & Flash should be a firmware action button",
        "reset edits should be paired with the Build & Flash action",
        "reset edits should be enabled after firmware edits",
        "Build & Flash should not appear as an edit tab",
        "inspectFirmwareResetAction",
        "reset edits should clear firmware diffs",
        "reset edits button should disable after resetting",
        "reset edits should announce that firmware edits were restored",
        "inspectBuildFlashBackAction",
        "Build & Flash panel should hide edit tabs",
        "Build & Flash panel should expose a back-to-edit button",
        "back-to-edit button should restore edit tabs",
        "back-to-edit button should close the Build & Flash panel",
        "short-desktop",
        "inspectBuildFlashScrollArea",
        "Build & Flash panel overflows vertically without scroll",
        "Build & Flash panel content cannot be scrolled to the bottom",
        "document.documentElement.scrollWidth > documentWidth + 1",
        "right pane should contain exactly one firmware key inspector",
        "right pane contains duplicated workbench controls",
        "Build & Flash status should use role=status",
        "Build & Flash status should be announced as an atomic polite live region",
        "inspectLayerStructureActions",
        "add layer should create one new layer",
        "add layer should fill keys with &trans bindings",
        "duplicate layer should preserve bindings from the source layer",
        "delete layer button should be disabled when the last layer is still referenced",
        "referenced layer delete button should explain why deletion is blocked",
        "deleting the added last layer should restore the original layer count",
        "inspectKeyBindingEditActions",
        "applying key binding should update the selected key to &kp B",
        "applying key binding should create one diff",
        "key inspector write target should reflect Tap B",
        "inspectComboEditActions",
        "combo add button should be in the combo list actions",
        "combo delete button should be in the combo list actions",
        "adding a combo should increase the combo count",
        "added combo should default to ESC",
        "added combo should show all-layer scope",
        "combo binding picker should use a clear input action label",
        "combo save button should identify that it updates the combo",
        "combo list delete button should be enabled for the selected combo",
        "deleting the selected combo from the list should restore the original combo count",
        "selectedComboLayerScope",
        "inspectTrackballEditActions",
        "trackball editor should group fields under Left",
        "trackball editor should group fields under Right",
        "trackball editor should group fields under Common",
        "applying trackball settings should update left CPI",
        "applying trackball settings should add an overlay diff",
        "inspectReleaseWizardPreconditions",
        "GitHub load should be disabled until a token is available",
        "token-ready release wizard should ask to load firmware files",
        "token-ready release wizard should expose a token clear button",
        "token clear button should be enabled after token entry",
        "token should not be persisted in localStorage",
        "token clear should empty the GitHub token input",
        "token clear should announce that the token was removed from memory",
        "GitHub token をメモリから消去しました",
        "Commit & Build should stay disabled before diff review",
        "layer structure toolbar is missing",
        "add layer button should be available in Firmware Mode",
        "duplicate layer button should be available in Firmware Mode",
        "delete layer button should stay disabled unless the last layer is selected",
        'button "${name}" is too tall',
        'button "${name}" has visible child overflow',
      ]) &&
      allIncludes(files.styles, [
        ".flash-side-toggle button",
        "align-self: start",
        ".flash-side-toggle button .button-label",
        ".firmware-workbench-actions",
        ".keyboard-panel > .browser-release-workbench",
        "overflow: auto",
        ".build-panel-heading",
        ".combo-list-actions",
        ".combo-row-scope",
        ".trackball-editor-groups",
        ".trackball-editor-group-fields",
        "grid-template-columns: repeat(auto-fit, minmax(min(112px, 100%), 1fr))",
      ]) &&
      allIncludes(files.main, [
        "formatComboLayerScope(combo)",
        "comboLayerMaskScope(combo)",
        "全 layer",
      ]) &&
      allIncludes(files.packageJson, ['"playwright-core"']),
  },
  {
    name: "firmware edit action labels use consistent user-facing terminology",
    pass: () =>
      allIncludes(files.main, [
        'actionLabel="キーに適用"',
        'actionLabel={keyWriteFeedback.kind === "writing" ? "書き込み中..." : "キーに適用"}',
        'saveLabel = "Combo を更新"',
        'actionLabel="選択したキー動作を入力"',
        "トラックボール設定を更新",
      ]) &&
      allIncludes(files.uiSmoke, [
        'getByRole("button", { name: "キーに適用" })',
        'getByRole("button", { name: "トラックボール設定を更新" })',
      ]) &&
      [
        "Binding に反映",
        "Binding を入力欄に反映",
        "設定に反映",
        'saveLabel = "更新"',
      ].every((label) => !files.main.includes(label)),
  },
  {
    name: "browser firmware layer structure editing is limited to safe operations",
    pass: () =>
      allIncludes(files.main, [
        "const ENABLE_LAYER_STRUCTURE_EDITING = true",
        "const canEditLayerStructure = ENABLE_LAYER_STRUCTURE_EDITING && !isDirectMode && files !== null",
        "activeLayerIndex === layers.length - 1",
        "末尾に空の layer を追加",
        "選択中の layer を複製",
        "番号参照のずれを避けるため、最後の layer だけ削除できます",
        "activeLayerReferences.length === 0",
        "参照中の layer は削除できません",
        "findLayerReferenceSites(parsedKeymap, activeLayerIndex)",
        "最後の layer は削除できません",
        "layer 削除は番号参照のずれを避けるため最後の layer のみ対応しています",
        "bindings: Array.from({ length: kobitoKeyPhysicalLayout.length }, () => \"&trans\")",
        "bindings: activeLayer.bindings",
      ]) &&
      allIncludes(files.keymapParser, [
        "export function findLayerReferenceSites",
        "combo.layers?.includes(targetLayerIndex)",
        "kind: \"combo-layers\"",
        "input.layers ?? combo.layers",
        "bindingReferencesLayer",
        "normalized.match(/^&lt\\s+(\\d+)(?:\\s|$)/)",
        "normalized.match(/^&(?:mo|to|tog|sl)\\s+(\\d+)(?:\\s|$)/)",
      ]) &&
      allIncludes(files.keymapParserTest, [
        'it("adds and deletes complete layer blocks"',
        'it("duplicates a layer by adding a block with copied bindings"',
        'it("finds references to a target layer before deletion"',
        'it("preserves combo layer scope when editing a combo"',
      ]),
  },
  {
    name: "Direct/Firmware combo comparison preserves layer scope",
    pass: () =>
      allIncludes(files.directKeymap, [
        "comboLayersToMask(combo.layers)",
        "layerMaskToLayers(combo)",
        "sameComparableLayers(left.layers, right.layers)",
        "layers: diff.directCombo.layers",
        "layers: directCombo.layers",
      ]) &&
      allIncludes(files.directKeymapTest, [
        'it("diffs Direct combo layer masks against firmware combo layer scopes"',
        'it("applies Direct combo layer scope changes back to firmware source"',
        "layers = <1>;",
        "layers = <2>;",
      ]),
  },
  {
    name: "browser firmware release checks run in GitHub Actions",
    pass: () =>
      allIncludes(files.pagesCi, [
        "Browser firmware release gates",
        "npm ci",
        "npm run check:browser-firmware",
        "npx playwright-core install chromium",
        "npm run check:browser-firmware:ui",
        "BROWSER_FIRMWARE_TMP_DIR: /tmp/kobitokey-browser-firmware",
        "needs: release-check",
        "github.event_name == 'workflow_dispatch'",
      ]),
  },
  {
    name: "GitHub OAuth and artifact zip are same-origin Worker APIs",
    pass: () =>
      allIncludes(files.worker, [
        '"/api/github/device-code"',
        '"/api/github/access-token"',
        '"/api/github/artifact-zip"',
        "unsupported_oauth_scope",
        "if (scope !== \"repo\")",
        "github_artifact_download_failed",
        'redirect: "manual"',
        "parseHttpsUrl",
        "github_artifact_redirect_invalid_location",
        '"Cache-Control": "no-store"',
      ]) &&
      allIncludes(files.workerTest, [
        "rejects unsupported GitHub OAuth scopes before calling GitHub",
        "sanitizes failed artifact download responses",
        "follows artifact zip redirects without forwarding the GitHub token",
        "rejects unsafe artifact redirect locations",
        "rejects malformed artifact redirect locations",
        "secret-token",
      ]) &&
      allIncludes(files.githubDeviceFlow, ["hasGitHubOAuthScope", "includes(requiredScope)"]) &&
      allIncludes(files.githubDeviceFlowTest, ["does not treat public_repo as the full repo scope"]) &&
      allIncludes(files.main, ["hasGitHubOAuthScope(token.scope, \"repo\")", "GitHub OAuth token に repo scope がありません"]),
  },
  {
    name: "Worker responses include release security headers",
    pass: () =>
      allIncludes(files.wranglerConfig, ['"binding": "ASSETS"', '"run_worker_first": true']) &&
      allIncludes(files.worker, [
        '"Content-Security-Policy"',
        '"Referrer-Policy"',
        '"X-Content-Type-Options"',
        '"Permissions-Policy"',
        '"frame-ancestors \'none\'"',
        "isLocalDev",
        "\"script-src 'self' 'unsafe-inline' 'unsafe-eval'\"",
      ]) &&
      allIncludes(files.workerTest, [
        "adds browser security headers to static asset responses",
        "allows Vite dev preamble under local development hosts",
        "adds browser security headers to API responses without losing no-store",
        "Content-Security-Policy",
        "no-referrer",
        "nosniff",
        "camera=()",
      ]),
  },
  {
    name: "GitHub commit is protected by loaded branch head SHA",
    pass: () =>
      allIncludes(files.githubClient, [
        "readGitHubFirmwareProjectSnapshot",
        "getGitHubBranchHeadSha",
        "constraints.expectedHeadSha",
        "GitHub branch が読み込み後に更新されています",
      ]) &&
      allIncludes(files.githubClientTest, ["reads managed firmware files at a stable branch head snapshot", "rejects commits when the branch head changed after loading"]),
  },
  {
    name: "GitHub repository and branch inputs are sanitized before API calls",
    pass: () =>
      allIncludes(files.githubFirmware, [
        "isGitHubPathSegment",
        "githubRepoApiPath",
        "encodeGitHubPath",
        "githubGitRefUrl",
        "githubGitRefsUrl",
      ]) &&
      allIncludes(files.githubFirmwareTest, [
        "rejects repository values that cannot be safe GitHub API path segments",
        "builds branch ref URLs with encoded branch segments",
        "firmware%20mode",
      ]) &&
      allIncludes(files.githubClient, ["githubGitRefUrl(ref, branch)", "githubGitRefsUrl(ref, plan.branch)"]),
  },
  {
    name: "mock GitHub release flow covers snapshot, commit, dispatch, run lookup, and artifact download together",
    pass: () =>
      allIncludes(files.githubClientTest, [
        "browser firmware GitHub release flow",
        "runs the managed file snapshot, commit, dispatch, run lookup, and artifact download flow",
        "ignores matching workflow run SHAs from other branches",
        "readGitHubFirmwareProjectSnapshot",
        "commitGitHubFirmwareFiles",
        "dispatchGitHubFirmwareBuild",
        "findGitHubFirmwareBuildRun",
        "downloadGitHubFirmwareArtifacts",
      ]) &&
      allIncludes(files.githubClient, ["candidate.head_sha === commitSha && candidate.head_branch === branch"]),
  },
  {
    name: "artifact download verifies successful run and matching commit/branch",
    pass: () =>
      allIncludes(files.githubClient, [
        "getGitHubFirmwareBuildRun",
        "constraints.expectedHeadSha",
        "constraints.expectedHeadBranch",
        "constraints.requireSuccess",
        "run.headSha !== constraints.expectedHeadSha",
        "run.headBranch !== constraints.expectedHeadBranch",
        "run.status !== \"completed\" || run.conclusion !== \"success\"",
        "artifact が見つかりません",
        "artifact は期限切れです",
        "artifact に UF2 が含まれていません",
      ]) &&
      allIncludes(files.main, [
        "expectedHeadBranch: browserFirmwareBranchRef",
        "Drop previously verified UF2 bytes before revalidating the run/artifact",
        "setBrowserFirmwareArtifacts(null);",
        "setBrowserFirmwareLeftFlashed(false);",
        "setBrowserFirmwareRightFlashed(false);",
      ]) &&
      allIncludes(files.githubClientTest, [
        "verifies the run commit, branch, and success state before downloading artifacts",
        "rejects artifact download when the run does not match the expected commit",
        "rejects artifact download when the run does not match the expected branch",
        "rejects artifact download before the run succeeds",
        "rejects successful runs with no artifacts",
        "rejects expired artifacts with an action the user can take",
        "rejects artifacts that do not contain UF2 files",
      ]),
  },
  {
    name: "release gate requires diff review before commit and a verified run before flash",
    pass: () =>
      allIncludes(files.releaseFlow, [
        "state.hasLocalChanges &&",
        "state.diffReviewed",
        "hasVerifiedSuccessfulRun",
        "canFlashFirmwareSide",
      ]) &&
      allIncludes(files.releaseFlowTest, [
        "allows commit only after files are changed and diff is reviewed",
        "requires a verified successful run before either side can be flashed",
        "forces left flash before right flash",
        "blocks flash when left and right artifact basenames are the same",
      ]),
  },
  {
    name: "flash execution path rechecks left/right gate before writing or marking manual completion",
    pass: () =>
      allIncludes(files.main, [
        "canFlashFirmwareSide(browserFirmwareReadiness, side)",
        "markBrowserFirmwareSideFlashed(side)",
        "setBrowserFirmwareDownloadedSide(side)",
        "UF2 ダウンロードをキャンセルしました",
        "requestFlashConfirmation",
        "keyboardHalfChecked",
      ]),
  },
  {
    name: "artifact manifest cannot map both sides to the same UF2",
    pass: () =>
      allIncludes(files.githubClient, ["classifyUf2ArtifactsFromManifests", "left && right && left === right"]) &&
      files.githubClientTest.includes("does not reuse a manifest-selected UF2 as the opposite side from filename fallback"),
  },
  {
    name: "browser flash writes only to verified UF2 bootloader folders",
    pass: () =>
      allIncludes(files.main, [
        "assertUf2BootloaderDirectory(handle)",
        "writeUf2ToDirectoryHandle",
        "confirmBrowserFirmwareFlashWrite",
        "confirmBrowserFirmwareManualFlashComplete",
        "FlashConfirmationDialog",
        "接続中の keyboard half",
        "bootloader volume にコピーします",
        "手動コピー済みなら",
      ]) &&
      !files.main.includes("window.confirm") &&
      allIncludes(files.bootloader, ["INFO_UF2.TXT", "CURRENT.UF2"]) &&
      allIncludes(files.bootloaderTest, ["accepts UF2 bootloader directories with INFO_UF2.TXT", "rejects directories without UF2 bootloader markers"]),
  },
  {
    name: "browser session persistence excludes token and UF2 bytes",
    pass: () =>
      !files.session.includes("token:") &&
      !files.session.includes("uf2Bytes") &&
      allIncludes(files.session, [
        "sanitizeRepoUrl",
        "sanitizeGitHubCommitUrl",
        "sanitizeGitHubRunUrl",
        "parseHttpsGitHubUrl",
        "githubPathMatches",
      ]) &&
      allIncludes(files.sessionTest, [
        "excludes token or artifact bytes",
        "not.toContain(\"secret\")",
        "not.toContain(\"uf2Bytes\")",
        "drops unsafe persisted GitHub URLs and invalid commit metadata",
        "keeps safe GitHub resume links only when they match the stored commit and run",
        "https://github.com/other/repo/commit/abc123",
      ]),
  },
  {
    name: "main merge readiness can be checked without touching the worktree",
    pass: () =>
      scriptIncludes("check:browser-firmware:merge-readiness", "node scripts/check-browser-firmware-merge-readiness.mjs") &&
      scriptIncludes("check:browser-firmware:merge-readiness-self-test", "node scripts/check-browser-firmware-merge-readiness-self-test.mjs") &&
      allIncludes(files.mergeReadiness, [
        "git",
        "merge-tree",
        "--write-tree",
        "--quiet",
        "working tree is dirty",
        "current branch is behind",
        "files changed on both branch",
        "BROWSER_FIRMWARE_MAIN_REF",
        "without touching the index or working tree",
      ]) &&
      allIncludes(files.mergeReadinessSelfTest, [
        "Expected clean merge-ready repository to pass",
        "Expected dirty repository to fail",
        "Expected --allow-dirty repository to pass",
        "Expected branch behind origin/main to fail",
        "Expected non-destructive merge conflict to fail",
        "OK browser firmware merge readiness self-test passed",
      ]),
  },
  {
    name: "release plan records remaining external E2E evidence gates",
    pass: () =>
      allIncludes(files.releasePlan, [
        "GitHub OAuth device flow の scope / rate limit を実環境で確認する",
        "Worker proxy の production deploy と artifact download を実 repository で確認する",
        "前回の UF2 bytes と左右 flash 完了状態をメモリから破棄",
        "check:browser-firmware:production-preflight",
        "preview preflight の成功は production 公開の証跡にしない",
        "release security headers missing や Worker API の 405",
        "実 repository と実 GitHub Actions で end-to-end QA を行う",
        "Flash E2E",
      ]) &&
      allIncludes(files.docsDeployment, [
        "PR / feature branch の Workers preview",
        "preview preflight の成功は production 公開の証跡にしない",
        "release security headers missing や Worker API の 405",
      ]) &&
      allIncludes(files.readme, [
        "A passing preview preflight is not production release evidence",
        "missing release",
        "405 responses from Worker API routes",
      ]),
  },
  {
    name: "external E2E evidence report can be validated before public release",
    pass: () =>
      scriptIncludes("check:browser-firmware:e2e-report", "node scripts/check-browser-firmware-external-evidence.mjs") &&
      scriptIncludes("check:browser-firmware:evidence-self-test", "node scripts/check-browser-firmware-evidence-self-test.mjs") &&
      scriptIncludes("check:browser-firmware:collector-self-test", "node scripts/check-browser-firmware-collector-self-test.mjs") &&
      scriptIncludes("check:browser-firmware:production-preflight", "node scripts/check-browser-firmware-production-preflight.mjs") &&
      scriptIncludes("check:browser-firmware:production-release-preflight", "node scripts/check-browser-firmware-production-preflight.mjs --require-oauth") &&
      scriptIncludes("check:browser-firmware:public-release", "node scripts/check-browser-firmware-public-release.mjs") &&
      scriptIncludes("check:browser-firmware:public-release-self-test", "node scripts/check-browser-firmware-public-release-self-test.mjs") &&
      scriptIncludes("check:browser-firmware:production-preflight-self-test", "node scripts/check-browser-firmware-production-preflight-self-test.mjs") &&
      scriptIncludes("collect:browser-firmware:e2e-report", "node scripts/collect-browser-firmware-e2e-evidence.mjs") &&
      allIncludes(files.publicReleaseCheck, [
        "BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID is required",
        "--e2e-report <report.json>",
        "production.url in the E2E report",
        "production-url argument must match e2e report production.url",
        "BROWSER_FIRMWARE_PRODUCTION_URL must match e2e report production.url",
        "e2e report commit.sha must match the current git HEAD",
        "--skip-current-head",
        "scripts/check-browser-firmware-merge-readiness.mjs",
        "scripts/check-browser-firmware-production-preflight.mjs",
        "--require-oauth",
        "scripts/check-browser-firmware-external-evidence.mjs",
      ]) &&
      allIncludes(files.publicReleaseSelfTest, [
        "BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID is required",
        "production-url argument must match e2e report production.url",
        "BROWSER_FIRMWARE_PRODUCTION_URL must match e2e report production.url",
        "e2e report commit.sha must match the current git HEAD",
        "OK browser firmware public release self-test passed",
      ]) &&
      allIncludes(files.docsDeployment, ["check:browser-firmware:public-release", "`production.url` と一致", "`commit.sha` は現在の git `HEAD` と一致"]) &&
      allIncludes(files.releasePlan, ["check:browser-firmware:public-release", "`production.url` と一致", "`commit.sha` は現在の git `HEAD` と一致"]) &&
      allIncludes(files.readme, ["check:browser-firmware:public-release", "must match `production.url`", "must match the current git `HEAD`"]) &&
      allIncludes(files.productionPreflight, [
        "--require-oauth",
        "BROWSER_FIRMWARE_PREFLIGHT_REQUIRE_OAUTH",
        "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware",
        "production URL must include mode=firmware",
        "production page is missing release security headers",
        "/api/github/device-code",
        "/api/github/access-token",
        "/api/github/artifact-zip",
        "BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID",
        "BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID is required when OAuth preflight is required",
        "device-code route should start OAuth device flow with 200",
        "device-code route should return a complete GitHub OAuth device code response",
        "production frontend bundle should include BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID",
        "collectSameOriginAssetUrls",
        "toSameOriginUrl",
        "unsupported_oauth_scope",
        "invalid_json",
        "Cache-Control: no-store",
      ]) &&
      allIncludes(files.productionPreflightSelfTest, [
        "Expected passing production preflight fixture to pass",
        "Expected failing production preflight fixture to fail",
        "Expected OAuth-required production preflight fixture without client id to fail",
        "Expected OAuth-required production preflight fixture with client id to pass",
        "Expected OAuth-required production preflight fixture with client id only in a cross-origin asset to fail",
        "Expected OAuth-required production preflight fixture to require the client id in the frontend bundle",
        "BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID",
        "preflight-client",
        "unembedded-client",
        "cross-origin.js",
        "production page is missing release security headers",
        "device-code route should reject invalid JSON with 400, got 405",
        "OK browser firmware production preflight self-test passed",
      ]) &&
      allIncludes(files.externalEvidenceCheck, [
        "docs/browser-firmware-e2e-evidence.template.json",
        "requireNonPlaceholderString",
        "verifiedAt must be an ISO timestamp",
        "tester is required",
        "production.url must not be a placeholder URL",
        "production.url must open browser Firmware Mode with mode=firmware",
        "requireFirmwareModeUrl",
        "isGitHubPath",
        "production.workerAccessTokenRouteChecked must be true",
        "production.workerUnsupportedScopeRejected must be true",
        "production.workerOAuthDeviceFlowStarted must be true",
        "production.frontendOAuthClientIdPresent must be true",
        "securityHeadersChecked must be true",
        "apiSecurityHeadersChecked must be true",
        "ci.browserFirmwareReleaseCheckPassed must be true",
        "commit.url must point to github.repository and commit.sha",
        "build.runUrl must point to github.repository and build.runId",
        "build.headSha must match commit.sha",
        "build.headBranch is required",
        "build.headBranch must match github.branch",
        "build.status must be completed",
        "build.event must be workflow_dispatch",
        "build.artifactNames must not be empty",
        "build.githubArtifacts must not be empty",
        "build.githubArtifacts[].sizeInBytes must be a positive integer",
        "build.githubArtifactUf2Files must not be empty",
        "build.githubArtifactManifests must be an array",
        "artifacts.classificationSource manifest requires build.githubArtifactManifests",
        "artifacts.classificationSource manifest requires manifest targets to match left and right UF2 names",
        "artifacts.left.uf2Name must include a left token when classificationSource is filename",
        "inferredUf2Side(value) === side",
        'tokens.includes("left") || tokens.includes("l")',
        'tokens.includes("right") || tokens.includes("r")',
        "hasLeft === hasRight",
        "artifacts.${side} must match a UF2 entry from build.githubArtifactUf2Files",
        "build.artifactsExpired must be false",
        "left and right artifact UF2 names must differ",
        "left and right artifact UF2 basenames must differ",
        "left and right artifact SHA-256 values must differ",
        "flash.${side}.completedAt must be an ISO timestamp",
        "flash.${side}.bootloaderMarkerChecked must be true",
        "flash.${side}.confirmationPromptAccepted must be true",
        "flash.${side}.keyboardHalfChecked must be true",
        "persistence.tokenStored must be false",
        "ui.smokeCommand must be npm run check:browser-firmware:ui",
        "ui.tokenNotStoredInLocalStorage must be true",
        "ui.tokenClearWorks must be true",
        "ui.buttonLayoutNoOverflow must be true",
        "ui.rightPaneDeduplicated must be true",
        "ui.layerStructureActionsPassed must be true",
        "ui.referencedLayerDeleteBlocked must be true",
        "ui.keyBindingEditActionsPassed must be true",
        "ui.comboEditActionsPassed must be true",
        "ui.trackballEditActionsPassed must be true",
        "ui.releaseWizardPreconditionsPassed must be true",
      ]) &&
      allIncludes(files.evidenceSelfTest, [
        "Expected valid external evidence report to pass",
        "Expected filename-classified external evidence report with l/r tokens to pass",
        "Expected ambiguous filename-classified external evidence report to fail",
        "Expected ambiguous filename report to reject the left UF2 name",
        "Expected placeholder external evidence report to fail",
        "kobitokey_l.uf2",
        "kobitokey_r.uf2",
        "kobitokey_left_right.uf2",
        "production.url must not be a placeholder URL",
        "production.apiSecurityHeadersChecked must be true",
        "production.workerOAuthDeviceFlowStarted must be true",
        "production.frontendOAuthClientIdPresent must be true",
        "github.repository must not be the template owner/repo placeholder",
        "build.headBranch must match github.branch",
        "build.githubArtifacts must not be empty",
        "build.githubArtifactUf2Files must not be empty",
        "artifacts.classificationSource manifest requires build.githubArtifactManifests",
        "artifacts.classificationSource manifest requires manifest targets to match left and right UF2 names",
        "artifacts.left must match a UF2 entry from build.githubArtifactUf2Files",
        "left and right artifact UF2 basenames must differ",
        "ui.tokenClearWorks must be true",
        "ui.referencedLayerDeleteBlocked must be true",
        "ui.smokeCommand must be npm run check:browser-firmware:ui",
      ]) &&
      allIncludes(files.evidenceCollector, [
        "BROWSER_FIRMWARE_E2E_PRODUCTION_URL",
        "BROWSER_FIRMWARE_E2E_OAUTH_CLIENT_ID",
        "BROWSER_FIRMWARE_E2E_PRODUCTION_FETCH_URL",
        "BROWSER_FIRMWARE_E2E_GITHUB_API_BASE_URL",
        "BROWSER_FIRMWARE_E2E_COMMIT_SHA",
        "BROWSER_FIRMWARE_E2E_RUN_ID",
        "BROWSER_FIRMWARE_E2E_LEFT_UF2",
        "BROWSER_FIRMWARE_E2E_RIGHT_UF2",
        "BROWSER_FIRMWARE_E2E_TOKEN_NOT_STORED_IN_LOCAL_STORAGE",
        "BROWSER_FIRMWARE_E2E_TOKEN_CLEAR_WORKS",
        "BROWSER_FIRMWARE_E2E_LAYER_STRUCTURE_ACTIONS_PASSED",
        "BROWSER_FIRMWARE_E2E_REFERENCED_LAYER_DELETE_BLOCKED",
        "BROWSER_FIRMWARE_E2E_KEY_BINDING_EDIT_ACTIONS_PASSED",
        "BROWSER_FIRMWARE_E2E_COMBO_EDIT_ACTIONS_PASSED",
        "BROWSER_FIRMWARE_E2E_TRACKBALL_EDIT_ACTIONS_PASSED",
        "BROWSER_FIRMWARE_E2E_RELEASE_WIZARD_PRECONDITIONS_PASSED",
        "collectProductionEvidence",
        "/api/github/access-token",
        "checkUnsupportedOAuthScope",
        "checkOAuthDeviceFlow",
        "checkFrontendOAuthClientId",
        "collectSameOriginAssetUrls",
        "toSameOriginUrl",
        "checkApiSecurityHeaders",
        "hasReleaseSecurityHeaders",
        "/api/github/artifact-zip",
        "checkInvalidJsonWorkerResponse(url, { requireReleaseSecurityHeaders: true })",
        "results.every(Boolean)",
        "unsupported_oauth_scope",
        "checkWorkerRoute",
        "body?.error === \"invalid_json\"",
        "body?.device_code && body?.user_code && body?.verification_uri && body?.expires_in",
        "fetchGitHubJson",
        "fetchGitHubBytes",
        "redirect: \"manual\"",
        "safeArtifactRedirectUrl",
        "hashFile",
        "collectCommitFilenames",
        "headBranch: run.head_branch || \"\"",
        "collectGitHubArtifactDetails",
        "collectGitHubArtifactEntries",
        "targetsFromManifest",
        "resolveManifestFile",
        "unzipSync",
        "collectArtifactsExpired",
        "cannot prove managed firmware file scope",
        "cannot prove artifact availability",
        "scripts/check-browser-firmware-external-evidence.mjs",
      ]) &&
      allIncludes(files.collectorSelfTest, [
        "createServer",
        "BROWSER_FIRMWARE_E2E_PRODUCTION_FETCH_URL",
        "BROWSER_FIRMWARE_E2E_GITHUB_API_BASE_URL",
        "left UF2 hash mismatch",
        "commit managed files were not collected from GitHub API",
        "build artifact names were not collected from GitHub API",
        "build head branch was not collected from GitHub API",
        "build artifact id was not collected from GitHub API",
        "build artifact size was not collected from GitHub API",
        "build artifact expiry state was not collected from GitHub API",
        "build artifact UF2 entries were not collected from GitHub artifact zip",
        "build artifact manifest entries were not collected from GitHub artifact zip",
        "build artifact manifest left target was not collected",
        "build artifact manifest right target was not collected",
        "GitHub token was forwarded to artifact redirect download URL",
        "left UF2 was not proven against GitHub artifact zip",
        "right UF2 was not proven against GitHub artifact zip",
        "production security headers were not collected",
        "production API security headers were not collected",
        "OAuth device flow was not started through production Worker",
        "frontend OAuth client id was not collected from production bundle",
        "collector should fail when OAuth client id is only present in a cross-origin frontend asset",
        "collector should report missing frontend OAuth client id evidence",
        "cross-origin.js",
        "unembedded-client",
        "access-token route was not checked",
        "unsupported OAuth scope rejection was not checked",
        "token localStorage UI smoke state was not collected",
        "token clear UI smoke state was not collected",
        "layer structure UI smoke state was not collected",
        "referenced layer delete UI smoke state was not collected",
        "key binding edit UI smoke state was not collected",
        "combo edit UI smoke state was not collected",
        "trackball edit UI smoke state was not collected",
        "release wizard precondition UI smoke state was not collected",
        "OK browser firmware external evidence collector self-test passed",
      ]) &&
      allIncludes(files.externalEvidenceTemplate, [
        '"verifiedAt"',
        '"tester"',
        '"securityHeadersChecked"',
        '"apiSecurityHeadersChecked"',
        '"browserFirmwareReleaseCheckPassed"',
        '"workerDeviceCodeRouteChecked"',
        '"workerAccessTokenRouteChecked"',
        '"workerUnsupportedScopeRejected"',
        '"workerOAuthDeviceFlowStarted"',
        '"frontendOAuthClientIdPresent"',
        '"oauthDeviceFlowVerified"',
        '"managedFiles"',
        '"artifactDownloaded"',
        '"artifactNames"',
        '"githubArtifacts"',
        '"githubArtifactUf2Files"',
        '"githubArtifactManifests"',
        '"targets"',
        '"headBranch"',
        '"sizeInBytes"',
        '"artifactsExpired"',
        '"bootloaderMarkerChecked"',
        '"confirmationPromptAccepted"',
        '"keyboardHalfChecked"',
        '"smokeCommand"',
        '"smokeViewportCount"',
        '"tokenNotStoredInLocalStorage"',
        '"tokenClearWorks"',
        '"rightPaneDeduplicated"',
        '"layerStructureActionsPassed"',
        '"referencedLayerDeleteBlocked"',
        '"keyBindingEditActionsPassed"',
        '"comboEditActionsPassed"',
        '"trackballEditActionsPassed"',
        '"releaseWizardPreconditionsPassed"',
      ]),
  },
];

const failed = checks.filter((check) => !check.pass());
if (failed.length > 0) {
  for (const check of failed) {
    console.error(`FAIL ${check.name}`);
  }
  process.exit(1);
}

for (const check of checks) {
  console.log(`OK ${check.name}`);
}

function read(path) {
  return readFileSync(path, "utf8");
}

function allIncludes(contents, needles) {
  return needles.every((needle) => contents.includes(needle));
}

function scriptIncludes(scriptName, fragment) {
  const parsed = JSON.parse(files.packageJson);
  return typeof parsed.scripts?.[scriptName] === "string" && parsed.scripts[scriptName].includes(fragment);
}
