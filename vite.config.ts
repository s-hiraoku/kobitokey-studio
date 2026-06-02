import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";

import { cloudflare } from "@cloudflare/vite-plugin";

const appCommitSha = resolveAppCommitSha();
const githubOAuthClientConfigured = Boolean(process.env.VITE_GITHUB_OAUTH_CLIENT_ID?.trim());

export default defineConfig({
  plugins: [react(), cloudflare()],
  clearScreen: false,
  define: {
    __KOBITOKEY_APP_COMMIT_SHA__: JSON.stringify(appCommitSha),
    __KOBITOKEY_GITHUB_OAUTH_CLIENT_CONFIGURED__: JSON.stringify(githubOAuthClientConfigured),
  },
  server: {
    host: "127.0.0.1",
    hmr: {
      host: "127.0.0.1",
      port: 1420,
    },
    strictPort: true,
    port: 1420,
  },
});

function resolveAppCommitSha(): string {
  const envSha =
    process.env.BROWSER_FIRMWARE_APP_COMMIT_SHA?.trim() ||
    process.env.CF_PAGES_COMMIT_SHA?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    process.env.COMMIT_SHA?.trim();
  if (envSha) {
    return envSha;
  }

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "development";
  }
}
