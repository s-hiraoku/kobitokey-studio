import { createServer } from "node:http";
import { spawn } from "node:child_process";

const appCommitSha = "89abcdef0123456789abcdef0123456789abcdef";

const goodServer = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/") {
    const host = request.headers.host || "127.0.0.1";
    const port = host.includes(":") ? host.split(":").pop() : "";
    const crossOriginScript = port ? `<script type="module" src="http://localhost:${port}/assets/cross-origin.js"></script>` : "";
    response.writeHead(200, {
      "Content-Type": "text/html",
      ...releaseSecurityHeaders(),
    });
    response.end(`<!doctype html><title>KobitoKey Studio</title><script type="module" src="/assets/app.js"></script>${crossOriginScript}`);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/release-metadata") {
    writeJson(response, 200, {
      schemaVersion: 1,
      appCommitSha,
    });
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

  if (request.method === "GET" && url.pathname === "/assets/cross-origin.js") {
    response.writeHead(200, {
      "Content-Type": "text/javascript",
      ...releaseSecurityHeaders(),
    });
    response.end('const oauthClientId = "unembedded-client";');
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/github/")) {
    readRequestBody(request, (body) => {
      try {
        const json = JSON.parse(body);
        if (
          url.pathname === "/api/github/device-code" &&
          json.scope === "repo" &&
          (json.clientId === "preflight-client" || json.clientId === "unembedded-client")
        ) {
          writeJson(response, 200, {
            device_code: "device",
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

  response.writeHead(404);
  response.end();
});

const badServer = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/") {
    response.writeHead(200, {
      "Content-Type": "text/html",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    response.end("<!doctype html><title>Old deploy</title>");
    return;
  }
  if (url.pathname.startsWith("/api/github/")) {
    response.writeHead(405);
    response.end();
    return;
  }
  response.writeHead(404);
  response.end();
});

try {
  const goodUrl = await listen(goodServer);
  const badUrl = await listen(badServer);

  const good = await runPreflight(goodUrl, {
    BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID: "preflight-client",
    BROWSER_FIRMWARE_PREFLIGHT_APP_COMMIT_SHA: appCommitSha,
  });
  if (good.status !== 0) {
    process.stderr.write(good.stderr);
    process.stdout.write(good.stdout);
    throw new Error("Expected passing production preflight fixture to pass");
  }

  const missingOAuth = await runPreflight(goodUrl, {}, ["--require-oauth"]);
  if (missingOAuth.status === 0) {
    throw new Error("Expected OAuth-required production preflight fixture without client id to fail");
  }
  if (!missingOAuth.stderr.includes("BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID is required when OAuth preflight is required")) {
    process.stderr.write(missingOAuth.stderr);
    throw new Error("Expected OAuth-required production preflight fixture to require a client id");
  }

  const wrongAppCommit = await runPreflight(goodUrl, { BROWSER_FIRMWARE_PREFLIGHT_APP_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567" });
  if (wrongAppCommit.status === 0) {
    throw new Error("Expected production preflight fixture with mismatched app commit SHA to fail");
  }
  if (!wrongAppCommit.stderr.includes("release metadata appCommitSha should match BROWSER_FIRMWARE_PREFLIGHT_APP_COMMIT_SHA")) {
    process.stderr.write(wrongAppCommit.stderr);
    throw new Error("Expected production preflight fixture to require the deployed app commit SHA");
  }

  const requiredOAuth = await runPreflight(goodUrl, { BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID: "preflight-client" }, ["--require-oauth"]);
  if (requiredOAuth.status !== 0) {
    process.stderr.write(requiredOAuth.stderr);
    process.stdout.write(requiredOAuth.stdout);
    throw new Error("Expected OAuth-required production preflight fixture with client id to pass");
  }

  const unembeddedOAuth = await runPreflight(goodUrl, { BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID: "unembedded-client" }, ["--require-oauth"]);
  if (unembeddedOAuth.status === 0) {
    throw new Error("Expected OAuth-required production preflight fixture with client id only in a cross-origin asset to fail");
  }
  if (!unembeddedOAuth.stderr.includes("production frontend bundle should include BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID")) {
    process.stderr.write(unembeddedOAuth.stderr);
    throw new Error("Expected OAuth-required production preflight fixture to require the client id in the frontend bundle");
  }

  const bad = await runPreflight(badUrl);
  if (bad.status === 0) {
    throw new Error("Expected failing production preflight fixture to fail");
  }
  for (const expected of [
    "production page is missing Content-Security-Policy",
    "production page is missing Strict-Transport-Security",
    "production page should return Referrer-Policy: no-referrer (got strict-origin-when-cross-origin)",
    "release metadata route should return 200, got 404",
    "device-code route should reject invalid JSON with 400, got 405",
    "device-code route should reject unsupported OAuth scope with 400, got 405",
  ]) {
    if (!bad.stderr.includes(expected)) {
      process.stderr.write(bad.stderr);
      throw new Error(`Expected failing production preflight fixture to include: ${expected}`);
    }
  }

  console.log("OK browser firmware production preflight self-test passed");
} finally {
  await close(goodServer);
  await close(badServer);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}/?mode=firmware`);
    });
  });
}

function runPreflight(url, env = {}, extraArgs = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/check-browser-firmware-production-preflight.mjs", ...extraArgs, url], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
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
    "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=()",
  };
}

function writeJson(response, status, value) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    ...releaseSecurityHeaders(),
  });
  response.end(JSON.stringify(value));
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.closeAllConnections?.();
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
