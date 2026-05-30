import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";

const HOST = "127.0.0.1";
const PORT = 1420;
const BASE_URL = process.env.BROWSER_FIRMWARE_SMOKE_URL || `http://${HOST}:${PORT}`;
const browserFirmwareTmpDir = process.env.BROWSER_FIRMWARE_TMP_DIR || process.env.RUNNER_TEMP || tmpdir();
const DEFAULT_PLAYWRIGHT_BROWSERS_PATH = join(browserFirmwareTmpDir, "kobitokey-playwright-browsers");
const DEFAULT_WRANGLER_LOG_PATH = join(browserFirmwareTmpDir, "kobitokey-wrangler-logs");
const DEFAULT_WRANGLER_REGISTRY_PATH = join(browserFirmwareTmpDir, "kobitokey-wrangler-registry");
const DEFAULT_XDG_CONFIG_HOME = join(browserFirmwareTmpDir, "kobitokey-xdg-config");
const DEFAULT_NPM_CACHE = join(browserFirmwareTmpDir, "kobitokey-npm-cache");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const require = createRequire(import.meta.url);
const PLAYWRIGHT_VERSION = require("playwright-core/package.json").version;

let serverProcess = null;
let serverOutput = "";

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(DEFAULT_PLAYWRIGHT_BROWSERS_PATH)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = DEFAULT_PLAYWRIGHT_BROWSERS_PATH;
}

for (const path of [DEFAULT_WRANGLER_LOG_PATH, DEFAULT_WRANGLER_REGISTRY_PATH, DEFAULT_XDG_CONFIG_HOME, DEFAULT_NPM_CACHE]) {
  mkdirSync(path, { recursive: true });
}

try {
  if (!(await canReach(BASE_URL))) {
    serverProcess = startDevServer();
    await waitForServer(BASE_URL);
  }

  await runSmoke();
} finally {
  stopDevServer();
}

async function runSmoke() {
  const { chromium } = await import("playwright-core");
  const browser = await launchBrowser(chromium);

  const failures = [];
  try {
    for (const viewport of [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "narrow-desktop", width: 1024, height: 900 },
    ]) {
      const page = await browser.newPage({ viewport });
      page.on("pageerror", (error) => failures.push(`${viewport.name}: page error: ${error.message}`));
      await page.goto(`${BASE_URL}/?mode=firmware`, { waitUntil: "networkidle" });
      failures.push(...(await inspectLayerStructureActions(page, viewport.name)));
      failures.push(...(await resetFirmwareEditsIfEnabled(page, viewport.name, "layer structure smoke")));
      failures.push(...(await inspectKeyBindingEditActions(page, viewport.name)));
      failures.push(...(await inspectComboEditActions(page, viewport.name)));
      failures.push(...(await inspectTrackballEditActions(page, viewport.name)));
      failures.push(...(await inspectFirmwareActionButtons(page, viewport.name)));
      await page.getByRole("button", { name: "Build & Flash" }).click();
      await page.getByText("GitHub Commit & Build").waitFor();
      failures.push(...(await inspectBuildFlashScrollArea(page, viewport.name)));
      if (viewport.name === "narrow-desktop") {
        await page.setViewportSize({ width: 1024, height: 640 });
        failures.push(...(await inspectBuildFlashScrollArea(page, "short-desktop")));
        await page.setViewportSize(viewport);
      }
      failures.push(...(await inspectReleaseWizardPreconditions(page, viewport.name)));
      failures.push(...(await inspectFirmwareUi(page, viewport.name)));
      failures.push(...(await inspectBuildFlashBackAction(page, viewport.name)));
      failures.push(...(await inspectFirmwareResetAction(page, viewport.name)));
      await page.close();
    }
  } finally {
    await browser.close();
  }

  if (failures.length > 0) {
    console.error("Browser firmware UI smoke failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("OK browser firmware UI smoke passed");
}

async function inspectLayerStructureActions(page, label) {
  const failures = [];
  const initial = await readLayerState(page);
  const addLayerButton = page.getByRole("button", { name: "Layer を追加" });
  const duplicateLayerButton = page.getByRole("button", { name: "選択中の layer を複製" });
  const deleteLayerButton = page.getByRole("button", { name: "選択中の layer を削除" });

  if (initial.layerCount < 1) {
    failures.push(`${label}: layer list is empty`);
    return failures;
  }
  if (initial.deleteDisabled !== true) {
    failures.push(`${label}: delete layer button should be disabled before the last layer is selected`);
  }

  await addLayerButton.click();
  const afterAdd = await readLayerState(page);
  if (afterAdd.layerCount !== initial.layerCount + 1) {
    failures.push(`${label}: add layer should create one new layer`);
  }
  if (afterAdd.activeLayer !== `${initial.layerCount}Layer ${initial.layerCount}`) {
    failures.push(`${label}: add layer should select the new layer, got "${afterAdd.activeLayer}"`);
  }
  if (afterAdd.selectedBinding !== "&trans") {
    failures.push(`${label}: add layer should fill keys with &trans bindings`);
  }
  if (afterAdd.deleteDisabled !== false) {
    failures.push(`${label}: delete layer button should be enabled on the added last layer`);
  }

  await duplicateLayerButton.click();
  const afterDuplicate = await readLayerState(page);
  if (afterDuplicate.layerCount !== initial.layerCount + 2) {
    failures.push(`${label}: duplicate layer should create one copied layer`);
  }
  if (!afterDuplicate.activeLayer?.includes("Copy")) {
    failures.push(`${label}: duplicate layer should select the copied layer`);
  }
  if (afterDuplicate.selectedBinding !== "&trans") {
    failures.push(`${label}: duplicate layer should preserve bindings from the source layer`);
  }

  await deleteLayerButton.click();
  const afterDeleteCopy = await readLayerState(page);
  if (afterDeleteCopy.layerCount !== initial.layerCount + 1) {
    failures.push(`${label}: deleting the copied last layer should return to one added layer`);
  }
  if (afterDeleteCopy.activeLayer !== `${initial.layerCount}Layer ${initial.layerCount}`) {
    failures.push(`${label}: deleting copied layer should select the previous last layer`);
  }

  await page.locator(".layer-list button").first().click();
  await page.locator(".physical-key").first().click();
  await setSelectedKeyRawBinding(page, `&mo ${initial.layerCount}`);
  await page.locator(".layer-list button").nth(initial.layerCount).click();
  const referencedLastLayer = await readLayerState(page);
  if (referencedLastLayer.deleteDisabled !== true) {
    failures.push(`${label}: delete layer button should be disabled when the last layer is still referenced`);
  }
  if (!referencedLastLayer.deleteTitle?.includes("参照中のため削除できません")) {
    failures.push(`${label}: referenced layer delete button should explain why deletion is blocked`);
  }
  await page.locator(".layer-list button").first().click();
  await page.locator(".physical-key").first().click();
  await setSelectedKeyRawBinding(page, "&kp Q");
  await page.locator(".layer-list button").nth(initial.layerCount).click();

  await deleteLayerButton.click();
  const afterDeleteAdded = await readLayerState(page);
  if (afterDeleteAdded.layerCount !== initial.layerCount) {
    failures.push(`${label}: deleting the added last layer should restore the original layer count`);
  }

  await page.locator(".layer-list button").first().click();
  const afterSelectFirst = await readLayerState(page);
  if (afterSelectFirst.deleteDisabled !== true) {
    failures.push(`${label}: delete layer button should be disabled again on a non-last layer`);
  }

  return failures;
}

async function setSelectedKeyRawBinding(page, binding) {
  await page.locator(".firmware-key-inspector .advanced-binding").evaluate((details) => {
    details.setAttribute("open", "");
  });
  await page.locator('.firmware-key-inspector input[name="zmkBinding"]').fill(binding);
  await page.getByRole("button", { name: "キーの動作に設定" }).click();
}

async function inspectKeyBindingEditActions(page, label) {
  const failures = [];
  await page.locator(".layer-list button").first().click();
  await page.locator(".physical-key").first().click();

  const initial = await readKeyBindingState(page);
  if (initial.selectedBinding !== "&kp Q") {
    failures.push(`${label}: expected first key to start as &kp Q, got ${initial.selectedBinding}`);
  }
  if (initial.diffCount !== 0) {
    failures.push(`${label}: expected no keymap diff before editing, got "${initial.diffTabText}"`);
  }

  await page.locator('.choice-grid button[title="B"]').click();
  await page.getByRole("button", { name: "キーの動作に設定" }).click();

  const afterApply = await readKeyBindingState(page);
  if (afterApply.selectedBinding !== "&kp B") {
    failures.push(`${label}: applying key binding should update the selected key to &kp B`);
  }
  if (afterApply.selectedLabel !== "B") {
    failures.push(`${label}: applying key binding should update the rendered key label to B`);
  }
  if (afterApply.diffCount !== 1) {
    failures.push(`${label}: applying key binding should create one diff, got "${afterApply.diffTabText}"`);
  }
  if (afterApply.writeTargetText !== "Tap B") {
    failures.push(`${label}: key inspector write target should reflect Tap B`);
  }

  return failures;
}

async function inspectReleaseWizardPreconditions(page, label) {
  const failures = [];
  const disconnected = await readReleaseWizardState(page);
  if (disconnected.nextAction !== "GitHub で接続") {
    failures.push(`${label}: disconnected release wizard should ask for GitHub connection`);
  }
  if (disconnected.loadDisabled !== true) {
    failures.push(`${label}: GitHub load should be disabled until a token is available`);
  }
  if (disconnected.commitDisabled !== true) {
    failures.push(`${label}: Commit & Build should be disabled before GitHub files are loaded`);
  }

  await page.locator("#browser-firmware-token").fill("release-smoke-token");
  const tokenReady = await readReleaseWizardState(page);
  if (tokenReady.nextAction !== "Firmware files を読み込み") {
    failures.push(`${label}: token-ready release wizard should ask to load firmware files`);
  }
  if (tokenReady.loadDisabled !== false) {
    failures.push(`${label}: GitHub load should be enabled after token, repository, and branch are available`);
  }
  if (tokenReady.clearTokenVisible !== true) {
    failures.push(`${label}: token-ready release wizard should expose a token clear button`);
  }
  if (tokenReady.clearTokenDisabled !== false) {
    failures.push(`${label}: token clear button should be enabled after token entry`);
  }
  if (tokenReady.diffReviewDisabled !== true) {
    failures.push(`${label}: Diff review should stay disabled before GitHub files are loaded`);
  }
  if (tokenReady.commitDisabled !== true) {
    failures.push(`${label}: Commit & Build should stay disabled before diff review`);
  }

  const tokenPersisted = await page.evaluate(() =>
    Object.entries(localStorage).some(
      ([key, value]) => key.includes("release-smoke-token") || value.includes("release-smoke-token"),
    ),
  );
  if (tokenPersisted) {
    failures.push(`${label}: token should not be persisted in localStorage`);
  }

  await page.getByRole("button", { name: "token を消去" }).click();
  await page.waitForFunction(() => document.querySelector("#browser-firmware-token")?.value === "");
  const cleared = await page.evaluate(() => ({
    status: document.querySelector(".browser-release-workbench .build-status[role='status']")?.textContent ?? "",
    tokenValue: document.querySelector("#browser-firmware-token")?.value ?? null,
  }));
  if (cleared.tokenValue !== "") {
    failures.push(`${label}: token clear should empty the GitHub token input`);
  }
  if (!cleared.status.includes("GitHub token をメモリから消去しました")) {
    failures.push(`${label}: token clear should announce that the token was removed from memory`);
  }

  return failures;
}

async function readReleaseWizardState(page) {
  return page.evaluate(() => {
    const buttonByText = (text) =>
      Array.from(document.querySelectorAll(".browser-release-workbench button")).find((button) =>
        button.textContent?.includes(text),
      );
    const nextText = Array.from(document.querySelectorAll(".browser-release-meta span")).find((node) =>
      node.textContent?.startsWith("次:"),
    )?.textContent;
    return {
      commitDisabled: buttonByText("Commit & Build")?.disabled ?? null,
      clearTokenDisabled: buttonByText("token を消去")?.disabled ?? null,
      clearTokenVisible: Boolean(buttonByText("token を消去")),
      diffReviewDisabled: buttonByText("Diff 確認済み")?.disabled ?? null,
      loadDisabled: buttonByText("GitHub から読み込み")?.disabled ?? null,
      nextAction: nextText?.replace(/^次:\s*/, "").trim() ?? null,
    };
  });
}

async function inspectComboEditActions(page, label) {
  const failures = [];
  await page.getByRole("tab", { name: /Combos/ }).click();
  const initial = await readComboState(page);
  const comboActions = page.locator(".combo-list-actions");
  const addButton = comboActions.getByRole("button", { name: "追加" });
  const deleteButton = comboActions.getByRole("button", { name: "削除" });

  if ((await addButton.count()) !== 1) {
    failures.push(`${label}: combo add button should be in the combo list actions`);
    return failures;
  }
  if ((await deleteButton.count()) !== 1) {
    failures.push(`${label}: combo delete button should be in the combo list actions`);
    return failures;
  }

  await addButton.click();
  const afterCreate = await readComboState(page);

  if (afterCreate.comboCount !== initial.comboCount + 1) {
    failures.push(`${label}: adding a combo should increase the combo count`);
  }
  if (afterCreate.editingCount !== 1) {
    failures.push(`${label}: adding a combo should select it for editing`);
  }
  if (afterCreate.selectedComboKeys !== "1 + 2") {
    failures.push(`${label}: added combo should default to the selected key pair, got "${afterCreate.selectedComboKeys}"`);
  }
  if (afterCreate.selectedComboBinding !== "ESC") {
    failures.push(`${label}: added combo should default to ESC, got "${afterCreate.selectedComboBinding}"`);
  }
  if (afterCreate.selectedComboLayerScope !== "全 layer") {
    failures.push(`${label}: added combo should show all-layer scope, got "${afterCreate.selectedComboLayerScope}"`);
  }
  const comboEditor = page.locator(".combo-editor");
  if ((await comboEditor.getByRole("button", { name: "Combo の動作に設定" }).count()) !== 1) {
    failures.push(`${label}: combo binding picker should identify that it sets the combo action`);
  }
  if ((await comboEditor.getByRole("button", { name: "Combo を保存" }).count()) !== 1) {
    failures.push(`${label}: combo save button should identify that it saves the combo`);
  }
  if (afterCreate.diffCount < initial.diffCount) {
    failures.push(`${label}: adding a combo should not lose existing diffs`);
  }
  if (await deleteButton.isDisabled()) {
    failures.push(`${label}: combo list delete button should be enabled for the selected combo`);
    return failures;
  }

  await deleteButton.click();
  const afterDelete = await readComboState(page);
  if (afterDelete.comboCount !== initial.comboCount) {
    failures.push(`${label}: deleting the selected combo from the list should restore the original combo count`);
  }
  if (afterDelete.editingCount !== 0) {
    failures.push(`${label}: deleting the selected combo should clear the editing selection`);
  }

  return failures;
}

async function inspectFirmwareActionButtons(page, label) {
  const failures = [];
  const actions = page.locator(".firmware-workbench-actions");
  const buildButton = actions.getByRole("button", { name: "Build & Flash" });
  const resetButton = actions.getByRole("button", { name: "編集をリセット" });

  if ((await buildButton.count()) !== 1) {
    failures.push(`${label}: Build & Flash should be a firmware action button`);
    return failures;
  }
  if ((await resetButton.count()) !== 1) {
    failures.push(`${label}: reset edits should be paired with the Build & Flash action`);
    return failures;
  }
  if (await resetButton.isDisabled()) {
    failures.push(`${label}: reset edits should be enabled after firmware edits`);
  }

  const buildTabCount = await page.getByRole("tab", { name: "Build & Flash" }).count();
  if (buildTabCount !== 0) {
    failures.push(`${label}: Build & Flash should not appear as an edit tab`);
  }

  return failures;
}

async function inspectFirmwareResetAction(page, label) {
  const failures = [];
  const resetButton = page.locator(".firmware-workbench-actions").getByRole("button", { name: "編集をリセット" });
  await resetButton.click();
  const afterReset = await page.evaluate(() => {
    const diffTab = Array.from(document.querySelectorAll('[role="tab"]')).find((tab) =>
      tab.textContent?.includes("Diff"),
    );
    const match = diffTab?.textContent?.match(/Diff\s*(\d+)/);
    return {
      diffCount: match ? Number(match[1]) : null,
      resetDisabled: Array.from(document.querySelectorAll(".firmware-workbench-actions button")).find((button) =>
        button.textContent?.includes("編集をリセット"),
      )?.disabled ?? null,
      status: document.querySelector(".statusbar")?.textContent?.trim() ?? "",
    };
  });

  if (afterReset.diffCount !== 0) {
    failures.push(`${label}: reset edits should clear firmware diffs`);
  }
  if (afterReset.resetDisabled !== true) {
    failures.push(`${label}: reset edits button should disable after resetting`);
  }
  if (!afterReset.status.includes("firmware 編集を読み込み時点に戻しました")) {
    failures.push(`${label}: reset edits should announce that firmware edits were restored`);
  }

  return failures;
}

async function resetFirmwareEditsIfEnabled(page, label, context) {
  const failures = [];
  const resetButton = page.locator(".firmware-workbench-actions").getByRole("button", { name: "編集をリセット" });
  if ((await resetButton.count()) !== 1 || (await resetButton.isDisabled())) {
    return failures;
  }

  await resetButton.click();
  const diffCount = await page.evaluate(() => {
    const diffTab = Array.from(document.querySelectorAll('[role="tab"]')).find((tab) =>
      tab.textContent?.includes("Diff"),
    );
    const match = diffTab?.textContent?.match(/Diff\s*(\d+)/);
    return match ? Number(match[1]) : null;
  });

  if (diffCount !== 0) {
    failures.push(`${label}: reset after ${context} should clear firmware diffs, got ${diffCount}`);
  }

  return failures;
}

async function inspectBuildFlashBackAction(page, label) {
  const failures = [];
  const buildPanelTabs = await page.locator(".browser-release-workbench .workbench-tablist").count();
  if (buildPanelTabs !== 0) {
    failures.push(`${label}: Build & Flash panel should hide edit tabs`);
  }

  const backButton = page.locator(".browser-release-workbench").getByRole("button", { name: "編集に戻る" });
  if ((await backButton.count()) !== 1) {
    failures.push(`${label}: Build & Flash panel should expose a back-to-edit button`);
    return failures;
  }

  await backButton.click();
  const editTabsVisible = await page.locator(".workbench-tablist").count();
  if (editTabsVisible !== 1) {
    failures.push(`${label}: back-to-edit button should restore edit tabs`);
  }
  const buildPanelVisible = await page.locator(".browser-release-workbench").count();
  if (buildPanelVisible !== 0) {
    failures.push(`${label}: back-to-edit button should close the Build & Flash panel`);
  }

  return failures;
}

async function inspectBuildFlashScrollArea(page, label) {
  const state = await page.evaluate(() => {
    const panel = document.querySelector(".browser-release-workbench");
    if (!panel) return null;
    const style = getComputedStyle(panel);
    const before = panel.scrollTop;
    panel.scrollTop = panel.scrollHeight;
    const after = panel.scrollTop;
    panel.scrollTop = before;
    return {
      canScroll: after > before,
      clientHeight: panel.clientHeight,
      overflowY: style.overflowY,
      scrollHeight: panel.scrollHeight,
    };
  });

  if (!state) {
    return [`${label}: Build & Flash panel is missing`];
  }
  if (state.scrollHeight > state.clientHeight + 1 && state.overflowY !== "auto" && state.overflowY !== "scroll") {
    return [`${label}: Build & Flash panel overflows vertically without scroll, overflow-y is ${state.overflowY}`];
  }
  if (state.scrollHeight > state.clientHeight + 1 && !state.canScroll) {
    return [`${label}: Build & Flash panel content cannot be scrolled to the bottom`];
  }
  return [];
}

async function inspectTrackballEditActions(page, label) {
  const failures = [];
  await page.getByRole("tab", { name: "Trackball" }).click();
  const initial = await readTrackballState(page);
  const nextLeftCpi = initial.leftCpi + 1;

  if (!initial.editorGroups.includes("Left")) {
    failures.push(`${label}: trackball editor should group fields under Left`);
  }
  if (!initial.editorGroups.includes("Right")) {
    failures.push(`${label}: trackball editor should group fields under Right`);
  }
  if (!initial.editorGroups.includes("Common")) {
    failures.push(`${label}: trackball editor should group fields under Common`);
  }

  await page.locator('input[name="trackball-leftCpi"]').fill(String(nextLeftCpi));
  await page.getByRole("button", { name: "トラックボール設定を保存" }).click();

  const afterApply = await readTrackballState(page);
  if (afterApply.leftCpi !== nextLeftCpi) {
    failures.push(`${label}: applying trackball settings should update left CPI to ${nextLeftCpi}`);
  }
  if (afterApply.diffCount <= initial.diffCount) {
    failures.push(`${label}: applying trackball settings should add an overlay diff`);
  }

  return failures;
}

async function readKeyBindingState(page) {
  return page.evaluate(() => {
    const readDiffCount = () => {
      const diffTab = Array.from(document.querySelectorAll('[role="tab"]')).find((tab) => tab.textContent?.includes("Diff"));
      const match = diffTab?.textContent?.match(/Diff\s*(\d+)/);
      return match ? Number(match[1]) : null;
    };
    const selectedKey = document.querySelector(".physical-key.selected");
    const diffTab = Array.from(document.querySelectorAll('[role="tab"]')).find((tab) =>
      tab.textContent?.includes("Diff"),
    );
    const writeTarget = document.querySelector(".binding-preview .binding-summary strong");
    return {
      diffCount: readDiffCount(),
      diffTabText: diffTab?.textContent?.trim() ?? null,
      selectedBinding: selectedKey?.getAttribute("title") ?? null,
      selectedLabel: selectedKey?.querySelector(".key-content strong")?.textContent?.trim() ?? null,
      writeTargetText: writeTarget?.textContent?.trim() ?? null,
    };
  });
}

async function readComboState(page) {
  return page.evaluate(() => {
    const readDiffCount = () => {
      const diffTab = Array.from(document.querySelectorAll('[role="tab"]')).find((tab) => tab.textContent?.includes("Diff"));
      const match = diffTab?.textContent?.match(/Diff\s*(\d+)/);
      return match ? Number(match[1]) : null;
    };
    const selectedRow = document.querySelector(".combo-row.selected");
    const selectedSummary = document.querySelector(".combo-editor-summary");
    const selectedScope = Array.from(selectedSummary?.querySelectorAll("div") ?? []).find((item) =>
      item.querySelector("span")?.textContent?.trim() === "Layers",
    );
    return {
      comboCount: document.querySelectorAll(".combo-list .combo-row").length,
      diffCount: readDiffCount(),
      editingCount: document.querySelectorAll(".combo-list .combo-row.selected").length,
      selectedComboBinding: selectedRow?.querySelector(".binding-chip strong")?.textContent?.trim() ?? null,
      selectedComboKeys: selectedSummary?.querySelector("strong")?.textContent?.trim() ?? null,
      selectedComboLayerScope: selectedScope?.querySelector("strong")?.textContent?.trim() ?? null,
    };
  });
}

async function readTrackballState(page) {
  return page.evaluate(() => {
    const readDiffCount = () => {
      const diffTab = Array.from(document.querySelectorAll('[role="tab"]')).find((tab) => tab.textContent?.includes("Diff"));
      const match = diffTab?.textContent?.match(/Diff\s*(\d+)/);
      return match ? Number(match[1]) : null;
    };
    return {
      editorGroups: Array.from(document.querySelectorAll(".trackball-editor-group legend strong")).map((node) =>
        node.textContent?.trim() ?? "",
      ),
      diffCount: readDiffCount(),
      leftCpi: Number(document.querySelector('input[name="trackball-leftCpi"]')?.value ?? Number.NaN),
    };
  });
}

async function readLayerState(page) {
  return page.evaluate(() => ({
    activeLayer: document.querySelector(".layer-list button.active")?.textContent?.trim() ?? null,
    deleteDisabled: document.querySelector('.layer-toolbar button[aria-label="選択中の layer を削除"]')?.disabled ?? null,
    deleteTitle: document.querySelector('.layer-toolbar button[aria-label="選択中の layer を削除"]')?.getAttribute("title") ?? null,
    layerCount: document.querySelectorAll(".layer-list button").length,
    selectedBinding: document.querySelector(".physical-key.selected")?.getAttribute("title") ?? null,
  }));
}

async function launchBrowser(chromium) {
  const args = ["--no-sandbox", "--disable-crash-reporter"];
  const launchErrors = [];

  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    try {
      return await chromium.launch({ headless: true, args });
    } catch (error) {
      launchErrors.push(`managed Chromium: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const executablePath = findBrowserExecutable();
  if (executablePath) {
    try {
      return await chromium.launch({
        executablePath,
        headless: true,
        args,
      });
    } catch (error) {
      launchErrors.push(`system browser ${executablePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(
    [
      "Unable to launch a Playwright-compatible browser.",
      `Install Chromium for this smoke check with: PLAYWRIGHT_BROWSERS_PATH=${DEFAULT_PLAYWRIGHT_BROWSERS_PATH} npx -y playwright@${PLAYWRIGHT_VERSION} install chromium`,
      ...launchErrors,
    ].join("\n"),
  );
}

async function inspectFirmwareUi(page, label) {
  return page.evaluate((viewportLabel) => {
    const failures = [];
    const documentWidth = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > documentWidth + 1) {
      failures.push(`${viewportLabel}: document has horizontal overflow`);
    }

    const workbench = document.querySelector(".browser-release-workbench");
    if (!workbench) {
      failures.push(`${viewportLabel}: Build & Flash workbench is missing`);
    }
    const releaseStatus = workbench?.querySelector(".build-status");
    if (releaseStatus?.getAttribute("role") !== "status") {
      failures.push(`${viewportLabel}: Build & Flash status should use role=status`);
    }
    if (releaseStatus?.getAttribute("aria-live") !== "polite" || releaseStatus?.getAttribute("aria-atomic") !== "true") {
      failures.push(`${viewportLabel}: Build & Flash status should be announced as an atomic polite live region`);
    }

    const inspector = document.querySelector("aside.inspector");
    if (!inspector) {
      failures.push(`${viewportLabel}: right inspector is missing`);
    } else {
      const keyInspectorCount = inspector.querySelectorAll(".firmware-key-inspector").length;
      if (keyInspectorCount !== 1) {
        failures.push(`${viewportLabel}: right pane should contain exactly one firmware key inspector, found ${keyInspectorCount}`);
      }
      const duplicateControls = inspector.querySelectorAll(
        ".direct-inspector-tabs, .direct-settings-tabs, .workbench-tabs, .combo-workbench, .trackball-workbench, .build-workbench",
      );
      if (duplicateControls.length > 0) {
        failures.push(`${viewportLabel}: right pane contains duplicated workbench controls`);
      }
    }

    const layerToolbar = document.querySelector('.layer-toolbar[aria-label="Layer controls"]');
    if (!layerToolbar) {
      failures.push(`${viewportLabel}: layer structure toolbar is missing`);
    } else {
      const addLayerButton = layerToolbar.querySelector('button[aria-label="Layer を追加"]');
      const duplicateLayerButton = layerToolbar.querySelector('button[aria-label="選択中の layer を複製"]');
      const deleteLayerButton = layerToolbar.querySelector('button[aria-label="選択中の layer を削除"]');
      if (!addLayerButton || addLayerButton.disabled) {
        failures.push(`${viewportLabel}: add layer button should be available in Firmware Mode`);
      }
      if (!duplicateLayerButton || duplicateLayerButton.disabled) {
        failures.push(`${viewportLabel}: duplicate layer button should be available in Firmware Mode`);
      }
      if (!deleteLayerButton || !deleteLayerButton.disabled) {
        failures.push(`${viewportLabel}: delete layer button should stay disabled unless the last layer is selected`);
      }
    }

    const requiredLabels = [
      "GitHub で接続",
      "GitHub から読み込み",
      "Diff 確認済み",
      "Commit & Build",
      "Build 起動",
      "最新 run",
      "Artifact 取得",
      "Left を書き込み",
      "Right を書き込み",
      "Left UF2 をダウンロード",
      "Right UF2 をダウンロード",
    ];
    for (const text of requiredLabels) {
      const found = Array.from(document.querySelectorAll(".browser-release-workbench button")).some((button) =>
        button.textContent?.includes(text),
      );
      if (!found) {
        failures.push(`${viewportLabel}: missing button label "${text}"`);
      }
    }

    const buttons = Array.from(
      document.querySelectorAll(".browser-release-workbench .build-actions button, .browser-release-workbench .flash-side-toggle button, .browser-release-workbench .flash-download-actions button"),
    );
    for (const button of buttons) {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      const name = button.textContent?.trim().replace(/\s+/g, " ") || "<unnamed>";
      if (rect.width < 32 || rect.height < 30) {
        failures.push(`${viewportLabel}: button "${name}" collapsed to ${Math.round(rect.width)}x${Math.round(rect.height)}`);
      }
      if (rect.height > 48) {
        failures.push(`${viewportLabel}: button "${name}" is too tall at ${Math.round(rect.height)}px`);
      }
      if (style.whiteSpace !== "nowrap") {
        failures.push(`${viewportLabel}: button "${name}" can wrap text`);
      }
      const children = Array.from(button.children);
      for (const child of children) {
        const childRect = child.getBoundingClientRect();
        if (childRect.left < rect.left - 1 || childRect.right > rect.right + 1) {
          failures.push(`${viewportLabel}: button "${name}" has visible child overflow`);
          break;
        }
      }
    }

    return failures;
  }, label);
}

function startDevServer() {
  const child = spawn(npmCommand, ["run", "dev", "--", "--host", HOST, "--port", String(PORT)], {
    cwd: process.cwd(),
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      BROWSER: "none",
      WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH || DEFAULT_WRANGLER_LOG_PATH,
      WRANGLER_REGISTRY_PATH: process.env.WRANGLER_REGISTRY_PATH || DEFAULT_WRANGLER_REGISTRY_PATH,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || DEFAULT_XDG_CONFIG_HOME,
      npm_config_cache: process.env.npm_config_cache || DEFAULT_NPM_CACHE,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  return child;
}

function stopDevServer() {
  if (!serverProcess || serverProcess.killed) {
    return;
  }
  if (process.platform === "win32") {
    serverProcess.kill();
    return;
  }
  try {
    process.kill(-serverProcess.pid, "SIGTERM");
  } catch {
    serverProcess.kill();
  }
}

async function waitForServer(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    if (await canReach(url)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}\n${serverOutput.slice(-4000)}`);
}

async function canReach(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 500);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

function findBrowserExecutable() {
  const candidates =
    process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ]
      : process.platform === "win32"
        ? [
            `${process.env.PROGRAMFILES || "C:\\Program Files"}\\Google\\Chrome\\Application\\chrome.exe`,
            `${process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)"}\\Google\\Chrome\\Application\\chrome.exe`,
            `${process.env.PROGRAMFILES || "C:\\Program Files"}\\Microsoft\\Edge\\Application\\msedge.exe`,
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/usr/bin/microsoft-edge",
          ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}
