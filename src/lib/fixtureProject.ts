import { parseKeymap } from "./keymapParser";
import type { ProjectFiles } from "./projectFiles";
import { parseTrackballSettings } from "./trackballParser";

export const FIXTURE_PROJECT_ASSETS = {
  keymap: "fixtures/KobitoKey.keymap",
  leftOverlay: "fixtures/KobitoKey_left.overlay",
  rightOverlay: "fixtures/KobitoKey_right.overlay",
} as const;

export async function loadFixtureProject(fetchImpl: typeof fetch = fetch): Promise<ProjectFiles> {
  const [keymap, leftOverlay, rightOverlay] = await Promise.all([
    readFixtureText(fetchImpl, FIXTURE_PROJECT_ASSETS.keymap),
    readFixtureText(fetchImpl, FIXTURE_PROJECT_ASSETS.leftOverlay),
    readFixtureText(fetchImpl, FIXTURE_PROJECT_ASSETS.rightOverlay),
  ]);

  const parsed = parseKeymap(keymap);
  if (parsed.layers.length === 0) {
    throw new Error("fixture keymap に layer が見つかりません。配信アセットを確認してください");
  }

  const trackball = parseTrackballSettings(leftOverlay, rightOverlay);
  if (trackball.leftCpi === undefined || trackball.rightCpi === undefined) {
    throw new Error("fixture overlay に trackball CPI が見つかりません。配信アセットを確認してください");
  }

  return { keymap, leftOverlay, rightOverlay };
}

async function readFixtureText(fetchImpl: typeof fetch, path: string): Promise<string> {
  const response = await fetchImpl(path);
  if (!response.ok) {
    const statusText = response.statusText.trim() || "HTTP error";
    throw new Error(`${path} を取得できません: ${response.status} ${statusText}`);
  }

  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`${path} が空です`);
  }
  if (isHtmlFallbackResponse(response, text)) {
    throw new Error(`${path} が HTML fallback を返しました。配信アセットを確認してください`);
  }
  return text;
}

function isHtmlFallbackResponse(response: Response, text: string): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const trimmed = text.trimStart().toLowerCase();
  return contentType.includes("text/html") || trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
}
