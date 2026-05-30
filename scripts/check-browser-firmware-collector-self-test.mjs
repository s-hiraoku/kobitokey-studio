import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { zipSync } from "fflate";

const commitSha = "0123456789abcdef0123456789abcdef01234567";
const appCommitSha = "89abcdef0123456789abcdef0123456789abcdef";
const repository = "juichi50iii/KobitoKey_QWERTY";
const runId = 123;
const dir = mkdtempSync(join(tmpdir(), "browser-firmware-collector-"));
const leftUf2Path = join(dir, "kobitokey_left.uf2");
const rightUf2Path = join(dir, "kobitokey_right.uf2");
const manualReportPath = join(dir, "manual-report.json");
const autoReportPath = join(dir, "auto-report.json");
const unembeddedClientReportPath = join(dir, "unembedded-client-report.json");
const fakeNpmPath = join(dir, "npm");
let artifactDownloadAuthorization = null;
const artifactZip = zipSync({
  "firmware/manifest.json": new TextEncoder().encode(
    JSON.stringify({
      outputs: [
        { side: "left", file: "kobitokey_left.uf2" },
        { side: "right", file: "kobitokey_right.uf2" },
      ],
    }),
  ),
  "firmware/kobitokey_left.uf2": new TextEncoder().encode("left firmware bytes"),
  "firmware/kobitokey_right.uf2": new TextEncoder().encode("right firmware bytes"),
  "firmware/readme.txt": new TextEncoder().encode("not firmware"),
});

writeFileSync(leftUf2Path, "left firmware bytes");
writeFileSync(rightUf2Path, "right firmware bytes");
writeFileSync(
  fakeNpmPath,
  `#!/bin/sh
if [ "$1" = "run" ] && [ "$2" = "check:browser-firmware:ui" ]; then
  echo "OK fake browser firmware UI smoke for $BROWSER_FIRMWARE_SMOKE_URL"
  exit 0
fi
echo "unexpected npm command: $*" >&2
exit 99
`,
);
chmodSync(fakeNpmPath, 0o755);

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/") {
    const host = request.headers.host || "127.0.0.1";
    const port = host.includes(":") ? host.split(":").pop() : "";
    const crossOriginScript = port ? `<script type="module" src="http://localhost:${port}/assets/cross-origin.js"></script>` : "";
    response.writeHead(200, {
      "Content-Type": "text/html",
      "Content-Security-Policy": "default-src 'self'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Permissions-Policy": "camera=()",
    });
    response.end(`<!doctype html><title>KobitoKey Studio</title><script type="module" src="/assets/app.js"></script>${crossOriginScript}`);
    return;
  }

  if (request.method === "GET" && url.pathname === "/assets/app.js") {
    response.writeHead(200, {
      "Content-Type": "text/javascript",
      "Content-Security-Policy": "default-src 'self'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Permissions-Policy": "camera=()",
    });
    response.end('const oauthClientId = "collector-oauth-client";');
    return;
  }

  if (request.method === "GET" && url.pathname === "/assets/cross-origin.js") {
    response.writeHead(200, {
      "Content-Type": "text/javascript",
      "Content-Security-Policy": "default-src 'self'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Permissions-Policy": "camera=()",
    });
    response.end('const oauthClientId = "unembedded-client";');
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/github/device-code") {
    readRequestBody(request, (body) => {
      try {
        const json = JSON.parse(body);
        if ((json.clientId === "collector-oauth-client" || json.clientId === "unembedded-client") && json.scope === "repo") {
          writeJson(response, 200, {
            device_code: "device-code",
            user_code: "USER-CODE",
            verification_uri: "https://github.com/login/device",
            expires_in: 900,
            interval: 5,
          });
          return;
        }
        writeJson(response, 400, { error: json.scope === "admin:org" ? "unsupported_oauth_scope" : "unexpected_scope" });
      } catch {
        writeJson(response, 400, { error: "invalid_json" });
      }
    });
    return;
  }

  if (
    request.method === "POST" &&
    (url.pathname === "/api/github/access-token" || url.pathname === "/api/github/artifact-zip")
  ) {
    response.writeHead(400, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...releaseSecurityHeaders(),
    });
    response.end(JSON.stringify({ error: "invalid_json" }));
    return;
  }

  if (request.method === "GET" && url.pathname === `/repos/${repository}/commits/${commitSha}`) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        sha: commitSha,
        html_url: `https://github.com/${repository}/commit/${commitSha}`,
        files: [
          { filename: "config/KobitoKey.keymap" },
          { filename: "config/boards/shields/KobitoKey/KobitoKey_left.overlay" },
          { filename: "config/boards/shields/KobitoKey/KobitoKey_right.overlay" },
        ],
      }),
    );
    return;
  }

  if (request.method === "GET" && url.pathname === `/repos/${repository}/actions/runs/${runId}`) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        id: runId,
        html_url: `https://github.com/${repository}/actions/runs/${runId}`,
        head_sha: commitSha,
        head_branch: "browser-firmware-release-test",
        status: "completed",
        conclusion: "success",
        event: "workflow_dispatch",
      }),
    );
    return;
  }

  if (request.method === "GET" && url.pathname === `/repos/${repository}/actions/runs/${runId}/artifacts`) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        total_count: 1,
        artifacts: [{ id: 456, name: "firmware", size_in_bytes: 12345, expired: false }],
      }),
    );
    return;
  }

  if (request.method === "GET" && url.pathname === `/repos/${repository}/actions/artifacts/456/zip`) {
    if (request.headers.authorization !== "Bearer collector-secret") {
      response.writeHead(401, { "Content-Type": "text/plain" });
      response.end("missing artifact API authorization");
      return;
    }
    response.writeHead(302, {
      Location: "/artifact-download/456",
    });
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/artifact-download/456") {
    artifactDownloadAuthorization = request.headers.authorization ?? null;
    response.writeHead(200, { "Content-Type": "application/zip" });
    response.end(Buffer.from(artifactZip));
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain" });
  response.end("not found");
});
server.keepAliveTimeout = 1;
server.headersTimeout = 1_000;

try {
  const { port } = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const result = await runCollector(baseUrl, manualReportPath, { includeManualUiSmoke: true, runUiSmoke: false });

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.stdout.write(result.stdout);
    process.exit(result.status ?? 1);
  }

  const report = JSON.parse(readFileSync(manualReportPath, "utf8"));
  assert(report.production.securityHeadersChecked === true, "production security headers were not collected");
  assert(report.production.fetchUrl === `${baseUrl}/`, "production fetch URL was not recorded in the report");
  assert(report.production.apiSecurityHeadersChecked === true, "production API security headers were not collected");
  assert(report.production.workerDeviceCodeRouteChecked === true, "device-code route was not checked");
  assert(report.production.workerAccessTokenRouteChecked === true, "access-token route was not checked");
  assert(report.production.workerUnsupportedScopeRejected === true, "unsupported OAuth scope rejection was not checked");
  assert(report.production.workerOAuthDeviceFlowStarted === true, "OAuth device flow was not started through production Worker");
  assert(report.production.frontendOAuthClientIdPresent === true, "frontend OAuth client id was not collected from production bundle");
  assert(report.production.workerArtifactRouteChecked === true, "artifact route was not checked");
  assert(report.ci.appCommitSha === appCommitSha, "app commit sha was not collected from environment");
  assert(report.commit.sha === commitSha, "commit sha was not collected from GitHub API");
  assert(report.commit.managedFiles.length === 3, "commit managed files were not collected from GitHub API");
  assert(report.commit.managedFiles.includes("config/KobitoKey.keymap"), "keymap managed file missing from report");
  assert(report.build.headSha === commitSha, "build head sha was not collected from GitHub API");
  assert(report.build.headBranch === "browser-firmware-release-test", "build head branch was not collected from GitHub API");
  assert(report.build.status === "completed", "build status was not collected from GitHub API");
  assert(report.build.event === "workflow_dispatch", "build event was not collected from GitHub API");
  assert(report.build.artifactNames.includes("firmware"), "build artifact names were not collected from GitHub API");
  assert(report.build.githubArtifacts[0].id === 456, "build artifact id was not collected from GitHub API");
  assert(report.build.githubArtifacts[0].sizeInBytes === 12345, "build artifact size was not collected from GitHub API");
  assert(report.build.artifactsExpired === false, "build artifact expiry state was not collected from GitHub API");
  assert(report.build.githubArtifactUf2Files.length === 2, "build artifact UF2 entries were not collected from GitHub artifact zip");
  assert(report.build.githubArtifactUf2Files[0].artifactId === 456, "build artifact UF2 artifact id was not collected");
  assert(report.build.githubArtifactManifests.length === 1, "build artifact manifest entries were not collected from GitHub artifact zip");
  assert(report.build.githubArtifactManifests[0].name === "firmware/manifest.json", "build artifact manifest name was not collected");
  assert(report.build.githubArtifactManifests[0].targets.left === "firmware/kobitokey_left.uf2", "build artifact manifest left target was not collected");
  assert(report.build.githubArtifactManifests[0].targets.right === "firmware/kobitokey_right.uf2", "build artifact manifest right target was not collected");
  assert(artifactDownloadAuthorization === null, "GitHub token was forwarded to artifact redirect download URL");
  assert(
    report.build.githubArtifactUf2Files.some(
      (file) => file.name === "firmware/kobitokey_left.uf2" && file.sha256 === sha256("left firmware bytes"),
    ),
    "left UF2 was not proven against GitHub artifact zip",
  );
  assert(
    report.build.githubArtifactUf2Files.some(
      (file) => file.name === "firmware/kobitokey_right.uf2" && file.sha256 === sha256("right firmware bytes"),
    ),
    "right UF2 was not proven against GitHub artifact zip",
  );
  assert(report.artifacts.left.sha256 === sha256("left firmware bytes"), "left UF2 hash mismatch");
  assert(report.artifacts.right.sha256 === sha256("right firmware bytes"), "right UF2 hash mismatch");
  assert(report.flash.left.confirmationPromptAccepted === true, "left flash confirmation prompt state was not collected");
  assert(report.flash.right.confirmationPromptAccepted === true, "right flash confirmation prompt state was not collected");
  assert(report.flash.left.keyboardHalfChecked === true, "left keyboard half check state was not collected");
  assert(report.flash.right.keyboardHalfChecked === true, "right keyboard half check state was not collected");
  assert(report.ui.tokenNotStoredInLocalStorage === true, "token localStorage UI smoke state was not collected");
  assert(report.ui.tokenClearWorks === true, "token clear UI smoke state was not collected");
  assert(report.ui.layerStructureActionsPassed === true, "layer structure UI smoke state was not collected");
  assert(report.ui.referencedLayerDeleteBlocked === true, "referenced layer delete UI smoke state was not collected");
  assert(report.ui.keyBindingEditActionsPassed === true, "key binding edit UI smoke state was not collected");
  assert(report.ui.comboEditActionsPassed === true, "combo edit UI smoke state was not collected");
  assert(report.ui.trackballEditActionsPassed === true, "trackball edit UI smoke state was not collected");
  assert(report.ui.releaseWizardPreconditionsPassed === true, "release wizard precondition UI smoke state was not collected");

  const autoResult = await runCollector(baseUrl, autoReportPath, { includeManualUiSmoke: false, runUiSmoke: true });
  if (autoResult.status !== 0) {
    process.stderr.write(autoResult.stderr);
    process.stdout.write(autoResult.stdout);
    process.exit(autoResult.status ?? 1);
  }

  const autoReport = JSON.parse(readFileSync(autoReportPath, "utf8"));
  assert(autoReport.ui.buildAndFlashSmokePassed === true, "automatic UI smoke result was not collected");
  assert(autoReport.ui.tokenNotStoredInLocalStorage === true, "automatic token localStorage UI smoke state was not collected");
  assert(autoReport.ui.tokenClearWorks === true, "automatic token clear UI smoke state was not collected");
  assert(autoReport.ui.layerStructureActionsPassed === true, "automatic layer structure UI smoke state was not collected");
  assert(autoReport.ui.referencedLayerDeleteBlocked === true, "automatic referenced layer delete UI smoke state was not collected");
  assert(autoReport.ui.keyBindingEditActionsPassed === true, "automatic key binding UI smoke state was not collected");
  assert(autoReport.ui.comboEditActionsPassed === true, "automatic combo UI smoke state was not collected");
  assert(autoReport.ui.trackballEditActionsPassed === true, "automatic trackball UI smoke state was not collected");
  assert(autoReport.ui.releaseWizardPreconditionsPassed === true, "automatic release wizard precondition UI smoke state was not collected");

  const unembeddedClientResult = await runCollector(baseUrl, unembeddedClientReportPath, {
    includeManualUiSmoke: true,
    oauthClientId: "unembedded-client",
    runUiSmoke: false,
  });
  if (unembeddedClientResult.status !== 0) {
    process.stderr.write(unembeddedClientResult.stderr);
    process.stdout.write(unembeddedClientResult.stdout);
    process.exit(unembeddedClientResult.status ?? 1);
  }
  const unembeddedClientReport = JSON.parse(readFileSync(unembeddedClientReportPath, "utf8"));
  assert(
    unembeddedClientReport.production.frontendOAuthClientIdPresent === false,
    "collector should record missing frontend OAuth client id evidence when the id is only in a cross-origin asset",
  );

  console.log("OK browser firmware external evidence collector self-test passed");
} finally {
  await close(server);
  rmSync(dir, { recursive: true, force: true });
}

function listen(serverToListen) {
  return new Promise((resolve, reject) => {
    serverToListen.once("error", reject);
    serverToListen.listen(0, "127.0.0.1", () => {
      serverToListen.off("error", reject);
      resolve(serverToListen.address());
    });
  });
}

function readRequestBody(request, callback) {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => callback(body));
}

function runCollector(baseUrl, reportPath, options) {
  return new Promise((resolve) => {
    const childArgs = ["scripts/collect-browser-firmware-e2e-evidence.mjs", "--out", reportPath];
    childArgs.push("--no-validate");
    if (options.runUiSmoke) {
      childArgs.push("--run-ui-smoke");
    }
    const child = spawn(process.execPath, childArgs, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH || ""}`,
        BROWSER_FIRMWARE_E2E_PRODUCTION_URL: "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware",
        BROWSER_FIRMWARE_E2E_PRODUCTION_FETCH_URL: `${baseUrl}/`,
        BROWSER_FIRMWARE_E2E_OAUTH_CLIENT_ID: options.oauthClientId || "collector-oauth-client",
        BROWSER_FIRMWARE_E2E_GITHUB_API_BASE_URL: baseUrl,
        BROWSER_FIRMWARE_E2E_GITHUB_TOKEN: "collector-secret",
        BROWSER_FIRMWARE_E2E_TESTER: "release-qa",
        BROWSER_FIRMWARE_E2E_CI_RUN_URL: "https://github.com/s-hiraoku/kobitokey-studio/actions/runs/123456789",
        BROWSER_FIRMWARE_E2E_APP_COMMIT_SHA: appCommitSha,
        BROWSER_FIRMWARE_E2E_CI_PASSED: "true",
        BROWSER_FIRMWARE_E2E_REPOSITORY: repository,
        BROWSER_FIRMWARE_E2E_BRANCH: "browser-firmware-release-test",
        BROWSER_FIRMWARE_E2E_COMMIT_SHA: commitSha,
        BROWSER_FIRMWARE_E2E_RUN_ID: String(runId),
        BROWSER_FIRMWARE_E2E_LEFT_UF2: leftUf2Path,
        BROWSER_FIRMWARE_E2E_RIGHT_UF2: rightUf2Path,
        BROWSER_FIRMWARE_E2E_FLASH_LEFT_AT: "2026-05-27T00:10:00Z",
        BROWSER_FIRMWARE_E2E_FLASH_RIGHT_AT: "2026-05-27T00:12:00Z",
        BROWSER_FIRMWARE_E2E_OAUTH_DEVICE_FLOW_VERIFIED: "true",
        BROWSER_FIRMWARE_E2E_OAUTH_SCOPE_VERIFIED: "true",
        BROWSER_FIRMWARE_E2E_RATE_LIMIT_VERIFIED: "true",
        BROWSER_FIRMWARE_E2E_FLASH_LEFT_COMPLETED: "true",
        BROWSER_FIRMWARE_E2E_FLASH_RIGHT_COMPLETED: "true",
        BROWSER_FIRMWARE_E2E_FLASH_LEFT_BOOTLOADER_MARKER_CHECKED: "true",
        BROWSER_FIRMWARE_E2E_FLASH_RIGHT_BOOTLOADER_MARKER_CHECKED: "true",
        BROWSER_FIRMWARE_E2E_FLASH_LEFT_CONFIRMATION_ACCEPTED: "true",
        BROWSER_FIRMWARE_E2E_FLASH_RIGHT_CONFIRMATION_ACCEPTED: "true",
        BROWSER_FIRMWARE_E2E_FLASH_LEFT_KEYBOARD_HALF_CHECKED: "true",
        BROWSER_FIRMWARE_E2E_FLASH_RIGHT_KEYBOARD_HALF_CHECKED: "true",
        BROWSER_FIRMWARE_E2E_RELOAD_RESTORED_PROGRESS: "true",
        BROWSER_FIRMWARE_E2E_TOKEN_STORED: "false",
        BROWSER_FIRMWARE_E2E_UF2_BYTES_STORED: "false",
        ...(options.includeManualUiSmoke
          ? {
              BROWSER_FIRMWARE_E2E_UI_SMOKE_PASSED: "true",
              BROWSER_FIRMWARE_E2E_TOKEN_NOT_STORED_IN_LOCAL_STORAGE: "true",
              BROWSER_FIRMWARE_E2E_TOKEN_CLEAR_WORKS: "true",
              BROWSER_FIRMWARE_E2E_BUTTON_LAYOUT_NO_OVERFLOW: "true",
              BROWSER_FIRMWARE_E2E_RIGHT_PANE_DEDUPLICATED: "true",
              BROWSER_FIRMWARE_E2E_LAYER_STRUCTURE_ACTIONS_PASSED: "true",
              BROWSER_FIRMWARE_E2E_REFERENCED_LAYER_DELETE_BLOCKED: "true",
              BROWSER_FIRMWARE_E2E_KEY_BINDING_EDIT_ACTIONS_PASSED: "true",
              BROWSER_FIRMWARE_E2E_COMBO_EDIT_ACTIONS_PASSED: "true",
              BROWSER_FIRMWARE_E2E_TRACKBALL_EDIT_ACTIONS_PASSED: "true",
              BROWSER_FIRMWARE_E2E_RELEASE_WIZARD_PRECONDITIONS_PASSED: "true",
            }
          : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({ status: 1, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("close", (status) => {
      resolve({ status: status ?? 1, stdout, stderr });
    });
  });
}

function close(serverToClose) {
  return new Promise((resolve, reject) => {
    serverToClose.closeAllConnections?.();
    serverToClose.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function releaseSecurityHeaders() {
  return {
    "Content-Security-Policy": "default-src 'self'; connect-src 'self' https://api.github.com",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Permissions-Policy": "camera=()",
  };
}

function writeJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...releaseSecurityHeaders(),
  });
  response.end(JSON.stringify(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
