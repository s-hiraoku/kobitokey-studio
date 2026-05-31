import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const appCommitSha = readGitHeadSha();
const seenAuthorizations = [];
const tempDir = mkdtempSync(join(tmpdir(), "browser-firmware-release-status-"));
let deployWorkerJobConclusion = "success";

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname.startsWith("/rate-limit/")) {
    response.writeHead(403, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: "API rate limit exceeded" }));
    return;
  }

  if (request.method === "GET" && url.pathname === "/") {
    response.writeHead(200, {
      "Content-Type": "text/html",
      ...releaseSecurityHeaders(),
    });
    response.end('<!doctype html><title>KobitoKey Studio</title><script type="module" src="/assets/app.js"></script>');
    return;
  }

  if (request.method === "GET" && url.pathname === "/assets/app.js") {
    response.writeHead(200, {
      "Content-Type": "text/javascript",
      ...releaseSecurityHeaders(),
    });
    response.end('const oauthClientId = "preflight-client";');
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/release-metadata") {
    writeJson(response, 200, {
      schemaVersion: 1,
      appCommitSha,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/repos/s-hiraoku/kobitokey-studio/actions/runs") {
    seenAuthorizations.push(request.headers.authorization ?? "");
    writeJson(response, 200, {
      workflow_runs: [
        {
          id: 12345,
          event: "pull_request",
          head_sha: appCommitSha,
          html_url: "https://github.com/s-hiraoku/kobitokey-studio/actions/runs/12345",
          jobs_url: `${origin(request)}/repos/s-hiraoku/kobitokey-studio/actions/runs/12345/jobs`,
          status: "completed",
          conclusion: "success",
        },
        {
          id: 67890,
          event: "workflow_dispatch",
          head_sha: appCommitSha,
          html_url: "https://github.com/s-hiraoku/kobitokey-studio/actions/runs/67890",
          jobs_url: `${origin(request)}/repos/s-hiraoku/kobitokey-studio/actions/runs/67890/jobs`,
          status: "completed",
          conclusion: "success",
        },
      ],
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/repos/s-hiraoku/kobitokey-studio/actions/runs/12345/jobs") {
    seenAuthorizations.push(request.headers.authorization ?? "");
    writeJson(response, 200, {
      jobs: [
        {
          name: "Browser firmware release gates",
          status: "completed",
          conclusion: "success",
        },
      ],
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/repos/s-hiraoku/kobitokey-studio/actions/runs/67890/jobs") {
    seenAuthorizations.push(request.headers.authorization ?? "");
    writeJson(response, 200, {
      jobs: [
        {
          name: "deploy-browser-firmware-worker",
          status: "completed",
          conclusion: deployWorkerJobConclusion,
        },
      ],
    });
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/github/")) {
    readRequestBody(request, (body) => {
      try {
        const json = JSON.parse(body);
        if (url.pathname === "/api/github/artifact-zip" && json.owner === "owner/name") {
          writeJson(response, 400, { error: "invalid_owner_or_repo" });
          return;
        }
        if (url.pathname === "/api/github/artifact-zip" && json.artifactId === -1) {
          writeJson(response, 400, { error: "invalid_artifact_id" });
          return;
        }
        if (url.pathname === "/api/github/device-code" && json.scope === "repo" && json.clientId === "preflight-client") {
          writeJson(response, 200, {
            device_code: "device",
            user_code: "USER-CODE",
            verification_uri: "https://github.com/login/device",
            expires_in: 900,
            interval: 5,
          });
          return;
        }
        writeJson(response, 400, { error: json.scope === "admin:org" ? "unsupported_oauth_scope" : "unexpected_request" });
      } catch {
        writeJson(response, 400, { error: "invalid_json" });
      }
    });
    return;
  }

  response.writeHead(404);
  response.end();
});

try {
  const baseUrl = await listen(server);
  const result = await runReleaseStatus(`${baseUrl}/?mode=firmware`, baseUrl);
  if (result.status !== 1) {
    process.stderr.write(result.stderr);
    process.stdout.write(result.stdout);
    throw new Error("Expected release status fixture to fail only because external E2E evidence is missing");
  }

  expectIncludes(result.stdout, "PASS GitHub Actions release gate");
  expectIncludes(result.stdout, "PASS production Worker deploy workflow");
  expectIncludes(result.stdout, "PASS production preflight");
  expectIncludes(result.stdout, "BLOCKER external E2E evidence");
  expectIncludes(result.stdout, "Next actions:");
  expectIncludes(result.stdout, "external E2E evidence: Generate an external E2E env template");
  expectIncludes(result.stdout, "BROWSER_FIRMWARE_E2E_BRANCH");
  expectIncludes(result.stdout, "firmware repository branch used by Commit & Build");
  expectIncludes(result.stdout, "$ BROWSER_FIRMWARE_E2E_PRODUCTION_URL=");
  expectIncludes(result.stdout, "BROWSER_FIRMWARE_E2E_CI_RUN_URL='https://github.com/s-hiraoku/kobitokey-studio/actions/runs/12345'");
  expectIncludes(result.stdout, `BROWSER_FIRMWARE_E2E_APP_COMMIT_SHA='${appCommitSha}'`);
  expectIncludes(result.stdout, "npm run collect:browser-firmware:e2e-report -- --print-env-template");
  expectIncludes(result.stdout, "$ source /tmp/browser-firmware-e2e.env");
  expectIncludes(result.stdout, "$ npm run check:browser-firmware:release-status -- --json --e2e-report path/to/report.json");
  expectIncludes(result.stdout, "Summary: 1 blocker(s),");
  expectExcludes(result.stdout, "preflight-client");
  expectExcludes(result.stderr, "preflight-client");
  expectExcludes(result.stdout, "release-status-token");
  expectExcludes(result.stderr, "release-status-token");
  if (!seenAuthorizations.every((authorization) => authorization === "Bearer release-status-token")) {
    throw new Error("Expected release status to use BROWSER_FIRMWARE_RELEASE_STATUS_GITHUB_TOKEN for GitHub API reads");
  }

  const jsonResult = await runReleaseStatus(`${baseUrl}/?mode=firmware`, baseUrl, ["--json"]);
  if (jsonResult.status !== 1) {
    process.stderr.write(jsonResult.stderr);
    process.stdout.write(jsonResult.stdout);
    throw new Error("Expected JSON release status fixture to fail only because external E2E evidence is missing");
  }
  let json;
  try {
    json = JSON.parse(jsonResult.stdout);
  } catch (error) {
    process.stdout.write(jsonResult.stdout);
    throw new Error(`Expected release status --json output to parse: ${String(error)}`);
  }
  if (json.ready !== false || json.blockerCount !== 1 || typeof json.warningCount !== "number") {
    process.stdout.write(jsonResult.stdout);
    throw new Error("Expected release status --json to expose ready=false with one blocker and a numeric warning count");
  }
  if (!Array.isArray(json.checks) || !json.checks.some((check) => check.name === "production preflight" && check.status === "pass")) {
    process.stdout.write(jsonResult.stdout);
    throw new Error("Expected release status --json to include passing production preflight check");
  }
  if (!Array.isArray(json.checks) || !json.checks.some((check) => check.name === "production Worker deploy workflow" && check.status === "pass")) {
    process.stdout.write(jsonResult.stdout);
    throw new Error("Expected release status --json to include passing production Worker deploy workflow check");
  }
  const releaseGateCheck = json.checks.find((check) => check.name === "GitHub Actions release gate");
  if (
    !releaseGateCheck ||
    !Array.isArray(releaseGateCheck.links) ||
    !releaseGateCheck.links.some(
      (link) =>
        link.label === "Release Gate Run" &&
        link.url === "https://github.com/s-hiraoku/kobitokey-studio/actions/runs/12345",
    )
  ) {
    process.stdout.write(jsonResult.stdout);
    throw new Error("Expected release status --json to include the release gate run evidence link");
  }
  const deployWorkflowCheck = json.checks.find((check) => check.name === "production Worker deploy workflow");
  if (
    !deployWorkflowCheck ||
    !Array.isArray(deployWorkflowCheck.links) ||
    !deployWorkflowCheck.links.some(
      (link) =>
        link.label === "Production Worker Deploy Run" &&
        link.url === "https://github.com/s-hiraoku/kobitokey-studio/actions/runs/67890",
    )
  ) {
    process.stdout.write(jsonResult.stdout);
    throw new Error("Expected release status --json to include the production deploy workflow run evidence link");
  }
  if (
    !Array.isArray(json.nextActions) ||
    !json.nextActions.some(
      (nextAction) =>
        nextAction.name === "external E2E evidence" &&
        nextAction.status === "blocker" &&
        nextAction.action.includes("--print-env-template") &&
        nextAction.action.includes("--run-ui-smoke") &&
        nextAction.action.includes("BROWSER_FIRMWARE_E2E_BRANCH") &&
        nextAction.action.includes("firmware repository branch used by Commit & Build") &&
        Array.isArray(nextAction.commands) &&
        nextAction.commands.some(
          (command) =>
            command.includes("BROWSER_FIRMWARE_E2E_PRODUCTION_URL=") &&
            command.includes("BROWSER_FIRMWARE_E2E_CI_RUN_URL='https://github.com/s-hiraoku/kobitokey-studio/actions/runs/12345'") &&
            command.includes(`BROWSER_FIRMWARE_E2E_APP_COMMIT_SHA='${appCommitSha}'`) &&
            command.includes("npm run collect:browser-firmware:e2e-report -- --print-env-template > /tmp/browser-firmware-e2e.env"),
        ) &&
        nextAction.commands.includes("source /tmp/browser-firmware-e2e.env") &&
        nextAction.commands.includes("npm run check:browser-firmware:release-status -- --json --e2e-report path/to/report.json") &&
        nextAction.commands.includes(
          "npm run write:browser-firmware:release-handoff -- --e2e-report path/to/report.json --out /tmp/browser-firmware-release-handoff.md",
        ) &&
        Array.isArray(nextAction.links) &&
        nextAction.links.some((link) => link.label === "Production URL" && link.url === `${baseUrl}/?mode=firmware`) &&
        nextAction.links.some((link) => link.label === "Release Plan" && link.url.includes("docs/browser-firmware-release-plan.md")),
    )
  ) {
    process.stdout.write(jsonResult.stdout);
    throw new Error("Expected release status --json to include actionable nextActions for external E2E evidence");
  }
  expectExcludes(jsonResult.stdout, "preflight-client");
  expectExcludes(jsonResult.stdout, "release-status-token");
  expectExcludes(jsonResult.stderr, "preflight-client");
  expectExcludes(jsonResult.stderr, "release-status-token");

  deployWorkerJobConclusion = "skipped";
  const skippedDeployJson = await runReleaseStatus(`${baseUrl}/?mode=firmware`, baseUrl, ["--json"]);
  deployWorkerJobConclusion = "success";
  if (skippedDeployJson.status !== 1) {
    process.stderr.write(skippedDeployJson.stderr);
    process.stdout.write(skippedDeployJson.stdout);
    throw new Error("Expected release status fixture with skipped production deploy workflow to fail only because external E2E evidence is missing");
  }
  const skippedDeployStatus = parseJsonOutput(
    skippedDeployJson.stdout,
    "Expected skipped-deploy release status --json output to parse",
  );
  const deployWorkflowAction = skippedDeployStatus.nextActions.find(
    (nextAction) => nextAction.name === "production Worker deploy workflow",
  );
  if (
    !deployWorkflowAction ||
    deployWorkflowAction.status !== "warn" ||
    !deployWorkflowAction.action.includes("Export the same public OAuth client id locally") ||
    !deployWorkflowAction.commands.includes("export VITE_GITHUB_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'") ||
    !deployWorkflowAction.commands.includes("export BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'") ||
    !deployWorkflowAction.commands.includes(
      `gh workflow run pages.yml --ref '${skippedDeployStatus.branch}' -f deploy_browser_firmware_worker=true`,
    ) ||
    !deployWorkflowAction.commands.includes("npm run check:browser-firmware:release-status -- --json") ||
    !Array.isArray(deployWorkflowAction.links) ||
    !deployWorkflowAction.links.some((link) => link.label === "GitHub Actions Workflow" && link.url.includes("actions/workflows/pages.yml")) ||
    !deployWorkflowAction.links.some((link) => link.label === "Production URL" && link.url === `${baseUrl}/?mode=firmware`)
  ) {
    process.stdout.write(skippedDeployJson.stdout);
    throw new Error("Expected production deploy workflow warning to include a GitHub CLI dispatch command");
  }
  expectExcludes(skippedDeployJson.stdout, "preflight-client");
  expectExcludes(skippedDeployJson.stdout, "release-status-token");

  const e2eReportPath = join(tempDir, "external-e2e.json");
  const staleE2eReportPath = join(tempDir, "external-e2e-stale.json");
  writeFileSync(e2eReportPath, JSON.stringify(createValidExternalEvidenceReport(), null, 2));
  writeFileSync(staleE2eReportPath, JSON.stringify(createStaleExternalEvidenceReport(), null, 2));
  const staleJson = await runReleaseStatus(`${baseUrl}/?mode=firmware`, baseUrl, [
    "--json",
    "--e2e-report",
    staleE2eReportPath,
  ]);
  if (staleJson.status !== 1) {
    process.stderr.write(staleJson.stderr);
    process.stdout.write(staleJson.stdout);
    throw new Error("Expected release status to reject external E2E evidence from a different app commit");
  }
  const staleStatus = parseJsonOutput(staleJson.stdout, "Expected stale-E2E release status --json output to parse");
  if (
    !staleStatus.checks.some(
      (check) =>
        check.name === "external E2E evidence" &&
        check.status === "blocker" &&
        check.detail.includes("ci.appCommitSha must match the current git HEAD") &&
        check.detail.includes("production.appCommitSha must match the current git HEAD"),
    )
  ) {
    process.stdout.write(staleJson.stdout);
    throw new Error("Expected release status to explain stale external E2E evidence rejection");
  }
  const rateLimitedJson = await runReleaseStatus(`${baseUrl}/?mode=firmware`, `${baseUrl}/rate-limit`, [
    "--json",
    "--e2e-report",
    e2eReportPath,
  ]);
  if (rateLimitedJson.status !== 0) {
    process.stderr.write(rateLimitedJson.stderr);
    process.stdout.write(rateLimitedJson.stdout);
    throw new Error("Expected release status to use validated external E2E evidence when GitHub API is rate-limited");
  }
  let fallbackJson;
  try {
    fallbackJson = JSON.parse(rateLimitedJson.stdout);
  } catch (error) {
    process.stdout.write(rateLimitedJson.stdout);
    throw new Error(`Expected rate-limited release status --json output to parse: ${String(error)}`);
  }
  if (fallbackJson.ready !== true || fallbackJson.blockerCount !== 0) {
    process.stdout.write(rateLimitedJson.stdout);
    throw new Error("Expected rate-limited release status fallback to have no blockers with validated external E2E evidence");
  }
  if (
    !fallbackJson.checks.some(
      (check) =>
        check.name === "GitHub Actions release gate" &&
        check.status === "pass" &&
        check.detail.includes("validated with Browser firmware release gates=success"),
    )
  ) {
    process.stdout.write(rateLimitedJson.stdout);
    throw new Error("Expected rate-limited release status to prove release gate from external E2E evidence");
  }
  if (
    !fallbackJson.checks.some(
      (check) =>
        check.name === "production Worker deploy workflow" &&
        check.status === "warn" &&
        check.detail.includes("GitHub API lookup failed"),
    )
  ) {
    process.stdout.write(rateLimitedJson.stdout);
    throw new Error("Expected rate-limited release status to warn that the deploy workflow job was not checked");
  }
  expectExcludes(rateLimitedJson.stdout, "preflight-client");
  expectExcludes(rateLimitedJson.stdout, "release-status-token");

  const missingOAuthJson = await runReleaseStatus(`${baseUrl}/?mode=firmware`, baseUrl, ["--json"], {
    omitOAuthClientId: true,
  });
  if (missingOAuthJson.status !== 1) {
    process.stderr.write(missingOAuthJson.stderr);
    process.stdout.write(missingOAuthJson.stdout);
    throw new Error("Expected release status to fail when OAuth client id env is missing");
  }
  let missingOAuthStatus;
  try {
    missingOAuthStatus = JSON.parse(missingOAuthJson.stdout);
  } catch (error) {
    process.stdout.write(missingOAuthJson.stdout);
    throw new Error(`Expected missing-OAuth release status --json output to parse: ${String(error)}`);
  }
  const oauthAction = missingOAuthStatus.nextActions.find((nextAction) => nextAction.name === "OAuth client id env");
  if (
    !oauthAction ||
    !oauthAction.action.includes("BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID and VITE_GITHUB_OAUTH_CLIENT_ID") ||
    !oauthAction.commands.includes("export VITE_GITHUB_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'") ||
    !oauthAction.commands.includes("export BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'")
  ) {
    process.stdout.write(missingOAuthJson.stdout);
    throw new Error("Expected missing-OAuth nextAction to set both local OAuth client id environment variables");
  }
  expectExcludes(missingOAuthJson.stdout, "preflight-client");
  expectExcludes(missingOAuthJson.stdout, "release-status-token");

  const missingFrontendOAuthJson = await runReleaseStatus(`${baseUrl}/?mode=firmware`, baseUrl, ["--json"], {
    omitFrontendOAuthClientId: true,
  });
  if (missingFrontendOAuthJson.status !== 1) {
    process.stderr.write(missingFrontendOAuthJson.stderr);
    process.stdout.write(missingFrontendOAuthJson.stdout);
    throw new Error("Expected release status fixture with missing frontend OAuth env to fail only because external E2E evidence is missing");
  }
  const missingFrontendOAuthStatus = parseJsonOutput(
    missingFrontendOAuthJson.stdout,
    "Expected missing-frontend-OAuth release status --json output to parse",
  );
  const missingFrontendOAuthAction = missingFrontendOAuthStatus.nextActions.find(
    (nextAction) => nextAction.name === "frontend OAuth client id env",
  );
  const missingFrontendOAuthCheck = missingFrontendOAuthStatus.checks.find(
    (check) => check.name === "frontend OAuth client id env",
  );
  if (
    !missingFrontendOAuthCheck ||
    missingFrontendOAuthCheck.status !== "warn" ||
    !missingFrontendOAuthCheck.detail.includes("VITE_GITHUB_OAUTH_CLIENT_ID is missing") ||
    !missingFrontendOAuthAction ||
    missingFrontendOAuthAction.status !== "warn" ||
    !missingFrontendOAuthAction.action.includes("local production deploy") ||
    !missingFrontendOAuthAction.commands.includes("export VITE_GITHUB_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'")
  ) {
    process.stdout.write(missingFrontendOAuthJson.stdout);
    throw new Error("Expected missing frontend OAuth env to warn before local production deploy");
  }
  expectExcludes(missingFrontendOAuthJson.stdout, "preflight-client");
  expectExcludes(missingFrontendOAuthJson.stdout, "release-status-token");

  const mismatchedFrontendOAuthJson = await runReleaseStatus(`${baseUrl}/?mode=firmware`, baseUrl, ["--json"], {
    frontendOAuthClientId: "different-client",
  });
  if (mismatchedFrontendOAuthJson.status !== 1) {
    process.stderr.write(mismatchedFrontendOAuthJson.stderr);
    process.stdout.write(mismatchedFrontendOAuthJson.stdout);
    throw new Error("Expected release status fixture with mismatched frontend OAuth env to fail only because external E2E evidence is missing");
  }
  const mismatchedFrontendOAuthStatus = parseJsonOutput(
    mismatchedFrontendOAuthJson.stdout,
    "Expected mismatched-frontend-OAuth release status --json output to parse",
  );
  const mismatchedFrontendOAuthAction = mismatchedFrontendOAuthStatus.nextActions.find(
    (nextAction) => nextAction.name === "frontend OAuth client id env",
  );
  const mismatchedFrontendOAuthCheck = mismatchedFrontendOAuthStatus.checks.find(
    (check) => check.name === "frontend OAuth client id env",
  );
  if (
    !mismatchedFrontendOAuthCheck ||
    mismatchedFrontendOAuthCheck.status !== "warn" ||
    !mismatchedFrontendOAuthCheck.detail.includes("does not match BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID") ||
    !mismatchedFrontendOAuthAction ||
    mismatchedFrontendOAuthAction.status !== "warn" ||
    !mismatchedFrontendOAuthAction.action.includes("same public GitHub OAuth App client id") ||
    !mismatchedFrontendOAuthAction.commands.includes("export VITE_GITHUB_OAUTH_CLIENT_ID='<GitHub OAuth App client id>'")
  ) {
    process.stdout.write(mismatchedFrontendOAuthJson.stdout);
    throw new Error("Expected mismatched frontend OAuth env to warn before local production deploy");
  }
  expectExcludes(mismatchedFrontendOAuthJson.stdout, "preflight-client");
  expectExcludes(mismatchedFrontendOAuthJson.stdout, "different-client");
  expectExcludes(mismatchedFrontendOAuthJson.stdout, "release-status-token");

  console.log("OK browser firmware release status self-test passed");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
  await new Promise((resolve) => server.close(resolve));
}

function runReleaseStatus(productionUrl, githubApiBaseUrl, extraArgs = [], options = {}) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      BROWSER_FIRMWARE_MAIN_REF: "HEAD",
      BROWSER_FIRMWARE_RELEASE_STATUS_ALLOW_DIRTY: "true",
      BROWSER_FIRMWARE_RELEASE_STATUS_GITHUB_API_BASE_URL: githubApiBaseUrl,
      BROWSER_FIRMWARE_RELEASE_STATUS_GITHUB_TOKEN: "release-status-token",
      CLOUDFLARE_API_TOKEN: "dummy-token",
    };
    if (!options.omitOAuthClientId) {
      env.BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID = "preflight-client";
      if (options.omitFrontendOAuthClientId) {
        delete env.VITE_GITHUB_OAUTH_CLIENT_ID;
      } else {
        env.VITE_GITHUB_OAUTH_CLIENT_ID = options.frontendOAuthClientId ?? "preflight-client";
      }
    } else {
      delete env.BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID;
      delete env.VITE_GITHUB_OAUTH_CLIENT_ID;
    }
    const child = spawn(process.execPath, ["scripts/check-browser-firmware-release-status.mjs", productionUrl, ...extraArgs], {
      cwd: process.cwd(),
      env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function parseJsonOutput(stdout, errorMessage) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    process.stdout.write(stdout);
    throw new Error(`${errorMessage}: ${String(error)}`);
  }
}

function readGitHeadSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Could not read git HEAD");
  }
  return result.stdout.trim();
}

function listen(httpServer) {
  return new Promise((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => {
      const address = httpServer.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address");
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function origin(request) {
  return `http://${request.headers.host}`;
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...releaseSecurityHeaders(),
  });
  response.end(JSON.stringify(body));
}

function readRequestBody(request, callback) {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => callback(body));
}

function releaseSecurityHeaders() {
  return {
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://api.github.com https://github.com;",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(self), serial=(self), bluetooth=(self)",
  };
}

function createValidExternalEvidenceReport() {
  const firmwareCommit = "0123456789abcdef0123456789abcdef01234567";
  return {
    schemaVersion: 1,
    verifiedAt: "2026-05-31T00:13:00Z",
    tester: "release-status-self-test",
    production: {
      url: "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware",
      fetchUrl: "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware",
      appCommitSha,
      workerDeviceCodeRouteChecked: true,
      workerAccessTokenRouteChecked: true,
      workerUnsupportedScopeRejected: true,
      workerOAuthDeviceFlowStarted: true,
      frontendOAuthClientIdPresent: true,
      workerArtifactRouteChecked: true,
      securityHeadersChecked: true,
      apiSecurityHeadersChecked: true,
    },
    ci: {
      runUrl: "https://github.com/s-hiraoku/kobitokey-studio/actions/runs/12345",
      runHeadSha: appCommitSha,
      status: "completed",
      conclusion: "success",
      appCommitSha,
      releaseGateJobName: "Browser firmware release gates",
      releaseGateJobConclusion: "success",
      browserFirmwareReleaseCheckPassed: true,
    },
    github: {
      repository: "juichi50iii/KobitoKey_QWERTY",
      branch: "browser-firmware-release-test",
      oauthDeviceFlowVerified: true,
      oauthScopeVerified: true,
      rateLimitBehaviorVerified: true,
    },
    commit: {
      sha: firmwareCommit,
      url: `https://github.com/juichi50iii/KobitoKey_QWERTY/commit/${firmwareCommit}`,
      managedFiles: ["config/KobitoKey.keymap"],
    },
    build: {
      runId: 67890,
      runUrl: "https://github.com/juichi50iii/KobitoKey_QWERTY/actions/runs/67890",
      headSha: firmwareCommit,
      headBranch: "browser-firmware-release-test",
      status: "completed",
      conclusion: "success",
      event: "workflow_dispatch",
      artifactDownloaded: true,
      artifactNames: ["firmware"],
      githubArtifacts: [{ id: 456, name: "firmware", sizeInBytes: 12345, expired: false }],
      githubArtifactUf2Files: [
        {
          artifactId: 456,
          artifactName: "firmware",
          name: "firmware/kobitokey_left.uf2",
          sizeInBytes: 123,
          sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
        {
          artifactId: 456,
          artifactName: "firmware",
          name: "firmware/kobitokey_right.uf2",
          sizeInBytes: 456,
          sha256: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        },
      ],
      githubArtifactManifests: [
        {
          artifactId: 456,
          artifactName: "firmware",
          name: "firmware/manifest.json",
          sizeInBytes: 90,
          sha256: "123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0",
          targets: {
            left: "firmware/kobitokey_left.uf2",
            right: "firmware/kobitokey_right.uf2",
          },
        },
      ],
      artifactsExpired: false,
    },
    artifacts: {
      classificationSource: "manifest",
      left: {
        uf2Name: "kobitokey_left.uf2",
        sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        artifactId: 456,
        artifactName: "firmware",
      },
      right: {
        uf2Name: "kobitokey_right.uf2",
        sha256: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        artifactId: 456,
        artifactName: "firmware",
      },
    },
    flash: {
      left: {
        completed: true,
        method: "direct-copy",
        bootloaderMarkerChecked: true,
        confirmationPromptAccepted: true,
        keyboardHalfChecked: true,
        uf2Name: "kobitokey_left.uf2",
        completedAt: "2026-05-31T00:10:00Z",
      },
      right: {
        completed: true,
        method: "download-copy",
        bootloaderMarkerChecked: true,
        confirmationPromptAccepted: true,
        keyboardHalfChecked: true,
        uf2Name: "kobitokey_right.uf2",
        completedAt: "2026-05-31T00:12:00Z",
      },
    },
    persistence: {
      reloadRestoredProgress: true,
      tokenStored: false,
      uf2BytesStored: false,
    },
    ui: {
      buildAndFlashSmokePassed: true,
      tokenNotStoredInLocalStorage: true,
      tokenClearWorks: true,
      buttonLayoutNoOverflow: true,
      rightPaneDeduplicated: true,
      layerStructureActionsPassed: true,
      referencedLayerDeleteBlocked: true,
      keyBindingEditActionsPassed: true,
      comboEditActionsPassed: true,
      trackballEditActionsPassed: true,
      releaseWizardPreconditionsPassed: true,
      artifactProvenanceVisible: true,
      artifactProvenanceMatchesBuildArtifacts: true,
      publicEntryLinksPassed: true,
      publicEntryUrls: [
        "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware",
        "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=combos",
        "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=trackball",
        "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=diff",
        "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware&tab=build",
        "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=direct",
      ],
      smokeCommand: "npm run check:browser-firmware:ui",
      smokeViewportCount: 2,
    },
    notes: "Self-test fixture without tokens or UF2 bytes.",
  };
}

function createStaleExternalEvidenceReport() {
  const report = createValidExternalEvidenceReport();
  const staleAppCommitSha = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
  return {
    ...report,
    production: {
      ...report.production,
      appCommitSha: staleAppCommitSha,
    },
    ci: {
      ...report.ci,
      runHeadSha: staleAppCommitSha,
      appCommitSha: staleAppCommitSha,
    },
  };
}

function expectIncludes(text, expected) {
  if (!text.includes(expected)) {
    process.stdout.write(text);
    throw new Error(`Expected release status output to include: ${expected}`);
  }
}

function expectExcludes(text, unexpected) {
  if (text.includes(unexpected)) {
    process.stdout.write(text);
    throw new Error(`Expected release status output to hide: ${unexpected}`);
  }
}
