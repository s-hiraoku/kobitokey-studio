import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";

const appCommitSha = readGitHeadSha();
const seenAuthorizations = [];

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

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
          jobs_url: `${origin(request)}/repos/s-hiraoku/kobitokey-studio/actions/runs/12345/jobs`,
          status: "completed",
          conclusion: "success",
        },
        {
          id: 67890,
          event: "workflow_dispatch",
          head_sha: appCommitSha,
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
          conclusion: "success",
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
  if (
    !Array.isArray(json.nextActions) ||
    !json.nextActions.some(
      (nextAction) =>
        nextAction.name === "external E2E evidence" &&
        nextAction.status === "blocker" &&
        nextAction.action.includes("--print-env-template") &&
        nextAction.action.includes("--run-ui-smoke") &&
        nextAction.action.includes("BROWSER_FIRMWARE_E2E_BRANCH") &&
        nextAction.action.includes("firmware repository branch used by Commit & Build"),
    )
  ) {
    process.stdout.write(jsonResult.stdout);
    throw new Error("Expected release status --json to include actionable nextActions for external E2E evidence");
  }
  expectExcludes(jsonResult.stdout, "preflight-client");
  expectExcludes(jsonResult.stdout, "release-status-token");
  expectExcludes(jsonResult.stderr, "preflight-client");
  expectExcludes(jsonResult.stderr, "release-status-token");

  console.log("OK browser firmware release status self-test passed");
} finally {
  await new Promise((resolve) => server.close(resolve));
}

function runReleaseStatus(productionUrl, githubApiBaseUrl, extraArgs = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/check-browser-firmware-release-status.mjs", productionUrl, ...extraArgs], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID: "preflight-client",
        BROWSER_FIRMWARE_MAIN_REF: "HEAD",
        BROWSER_FIRMWARE_RELEASE_STATUS_ALLOW_DIRTY: "true",
        BROWSER_FIRMWARE_RELEASE_STATUS_GITHUB_API_BASE_URL: githubApiBaseUrl,
        BROWSER_FIRMWARE_RELEASE_STATUS_GITHUB_TOKEN: "release-status-token",
        CLOUDFLARE_API_TOKEN: "dummy-token",
      },
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
