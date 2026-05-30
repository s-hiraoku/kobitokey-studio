const DEFAULT_PRODUCTION_URL = "https://kobitokey-studio.s-hiraoku.workers.dev/?mode=firmware";

const args = process.argv.slice(2);
const requireOAuth =
  args.includes("--require-oauth") || process.env.BROWSER_FIRMWARE_PREFLIGHT_REQUIRE_OAUTH === "true";

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: node scripts/check-browser-firmware-production-preflight.mjs [production-url]
       node scripts/check-browser-firmware-production-preflight.mjs --require-oauth [production-url]

Checks that a deployed browser Firmware Mode URL has release security headers
and same-origin Worker API routes before running the full external E2E evidence
collector.

Default URL:
  ${DEFAULT_PRODUCTION_URL}

Optional environment:
  BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID
    When set, the preflight also verifies that the deployed Worker can start
    a real GitHub OAuth device flow with repo scope.
  BROWSER_FIRMWARE_PREFLIGHT_APP_COMMIT_SHA
    When set, the preflight verifies /api/release-metadata returns the same
    deployed app commit SHA.
  BROWSER_FIRMWARE_PREFLIGHT_REQUIRE_OAUTH=true
    Fails unless BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID is set and the
    deployed Worker can start a real GitHub OAuth device flow with repo scope,
    and the deployed frontend bundle contains the same public client id.`);
  process.exit(0);
}

const productionUrl = args.find((arg) => !arg.startsWith("--")) || process.env.BROWSER_FIRMWARE_PRODUCTION_URL || DEFAULT_PRODUCTION_URL;
const issues = [];
const RELEASE_SECURITY_HEADERS = [
  { name: "Content-Security-Policy", header: "content-security-policy" },
  { name: "Strict-Transport-Security", header: "strict-transport-security" },
  { name: "Referrer-Policy", header: "referrer-policy", expected: "no-referrer" },
  { name: "X-Content-Type-Options", header: "x-content-type-options", expected: "nosniff" },
  { name: "X-Frame-Options", header: "x-frame-options", expected: "DENY" },
  { name: "Cross-Origin-Opener-Policy", header: "cross-origin-opener-policy", expected: "same-origin-allow-popups" },
  { name: "Cross-Origin-Resource-Policy", header: "cross-origin-resource-policy", expected: "same-origin" },
  { name: "Permissions-Policy", header: "permissions-policy" },
];

await checkProductionPreflight(productionUrl);

if (issues.length > 0) {
  console.error(`${productionUrl} is not ready for browser firmware production preflight:`);
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(`OK ${productionUrl} passed browser firmware production preflight`);

async function checkProductionPreflight(rawUrl) {
  const url = parseHttpsUrl(rawUrl);
  if (!url) {
    issues.push("production URL must be a valid http(s) URL");
    return;
  }
  if (url.searchParams.get("mode") !== "firmware") {
    issues.push("production URL must include mode=firmware");
  }

  const page = await fetch(url).catch((error) => {
    issues.push(`production page request failed: ${formatError(error)}`);
    return null;
  });
  if (!page) return;
  if (!page.ok) {
    issues.push(`production page returned ${page.status}`);
  }
  issues.push(...collectReleaseSecurityHeaderIssues("production page", page.headers));
  const pageHtml = await page.text().catch((error) => {
    issues.push(`production page body could not be read: ${formatError(error)}`);
    return "";
  });

  const apiBase = new URL(url);
  await checkReleaseMetadata(new URL("/api/release-metadata", apiBase));
  await checkInvalidJsonRoute(new URL("/api/github/device-code", apiBase), "device-code");
  await checkInvalidJsonRoute(new URL("/api/github/access-token", apiBase), "access-token");
  await checkInvalidJsonRoute(new URL("/api/github/artifact-zip", apiBase), "artifact-zip");
  await checkUnsupportedOAuthScope(new URL("/api/github/device-code", apiBase));
  await checkArtifactRouteValidation(new URL("/api/github/artifact-zip", apiBase));
  await checkOAuthDeviceFlow(new URL("/api/github/device-code", apiBase));
  await checkFrontendOAuthClientId(url, pageHtml);
}

async function checkReleaseMetadata(url) {
  const response = await fetch(url).catch((error) => {
    issues.push(`release metadata request failed: ${formatError(error)}`);
    return null;
  });
  if (!response) return;
  if (response.status !== 200) {
    issues.push(`release metadata route should return 200, got ${response.status}`);
    return;
  }
  if (response.headers.get("cache-control") !== "no-store") {
    issues.push("release metadata route should return Cache-Control: no-store");
  }
  issues.push(...collectReleaseSecurityHeaderIssues("release metadata route", response.headers));
  const body = await response.json().catch(() => null);
  if (body?.schemaVersion !== 1) {
    issues.push("release metadata route should return schemaVersion 1");
  }
  if (!isSha(body?.appCommitSha)) {
    issues.push("release metadata appCommitSha should be a 40-character SHA");
  }
  const expectedAppCommitSha = process.env.BROWSER_FIRMWARE_PREFLIGHT_APP_COMMIT_SHA?.trim();
  if (expectedAppCommitSha && body?.appCommitSha !== expectedAppCommitSha) {
    issues.push("release metadata appCommitSha should match BROWSER_FIRMWARE_PREFLIGHT_APP_COMMIT_SHA");
  }
}

async function checkInvalidJsonRoute(url, label) {
  const response = await postJson(url, "{");
  if (!response) return;
  if (response.status !== 400) {
    issues.push(`${label} route should reject invalid JSON with 400, got ${response.status}`);
    return;
  }
  if (response.headers.get("cache-control") !== "no-store") {
    issues.push(`${label} route should return Cache-Control: no-store`);
  }
  issues.push(...collectReleaseSecurityHeaderIssues(`${label} route`, response.headers));
  const body = await response.json().catch(() => null);
  if (body?.error !== "invalid_json") {
    issues.push(`${label} route should return invalid_json for malformed JSON`);
  }
}

async function checkUnsupportedOAuthScope(url) {
  const response = await postJson(url, JSON.stringify({ clientId: "browser-firmware-production-preflight", scope: "admin:org" }));
  if (!response) return;
  if (response.status !== 400) {
    issues.push(`device-code route should reject unsupported OAuth scope with 400, got ${response.status}`);
    return;
  }
  const body = await response.json().catch(() => null);
  if (body?.error !== "unsupported_oauth_scope") {
    issues.push("device-code route should return unsupported_oauth_scope for unsupported scopes");
  }
}

async function checkArtifactRouteValidation(url) {
  await checkJsonError(
    url,
    JSON.stringify({ owner: "owner/name", repo: "repo", artifactId: 1, token: "preflight-token" }),
    "invalid_owner_or_repo",
    "artifact-zip route should reject invalid owner/repo path segments",
  );
  await checkJsonError(
    url,
    JSON.stringify({ owner: "owner", repo: "repo", artifactId: -1, token: "preflight-token" }),
    "invalid_artifact_id",
    "artifact-zip route should reject invalid artifact ids",
  );
}

async function checkJsonError(url, bodyText, expectedError, message) {
  const response = await postJson(url, bodyText);
  if (!response) return;
  if (response.status !== 400) {
    issues.push(`${message} with 400, got ${response.status}`);
    return;
  }
  if (response.headers.get("cache-control") !== "no-store") {
    issues.push(`${message} with Cache-Control: no-store`);
  }
  issues.push(...collectReleaseSecurityHeaderIssues(message, response.headers));
  const body = await response.json().catch(() => null);
  if (body?.error !== expectedError) {
    issues.push(`${message} with ${expectedError}`);
  }
}

async function checkOAuthDeviceFlow(url) {
  const clientId = process.env.BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    if (requireOAuth) {
      issues.push("BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID is required when OAuth preflight is required");
    }
    return;
  }

  const response = await postJson(url, JSON.stringify({ clientId, scope: "repo" }));
  if (!response) return;
  if (response.status !== 200) {
    issues.push(`device-code route should start OAuth device flow with 200, got ${response.status}`);
    return;
  }
  if (response.headers.get("cache-control") !== "no-store") {
    issues.push("device-code OAuth response should return Cache-Control: no-store");
  }
  issues.push(...collectReleaseSecurityHeaderIssues("device-code OAuth response", response.headers));
  const body = await response.json().catch(() => null);
  if (!body?.device_code || !body?.user_code || !body?.verification_uri || !body?.expires_in) {
    issues.push("device-code route should return a complete GitHub OAuth device code response");
  }
}

async function checkFrontendOAuthClientId(pageUrl, pageHtml) {
  const clientId = process.env.BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID?.trim();
  if (!clientId) return;
  if (pageHtml.includes(clientId)) return;

  const assetUrls = collectSameOriginAssetUrls(pageUrl, pageHtml);
  for (const assetUrl of assetUrls) {
    const response = await fetch(assetUrl).catch(() => null);
    if (!response?.ok) continue;
    const text = await response.text().catch(() => "");
    if (text.includes(clientId)) {
      return;
    }
  }
  issues.push("production frontend bundle should include BROWSER_FIRMWARE_PREFLIGHT_OAUTH_CLIENT_ID for the GitHub connect button");
}

function collectSameOriginAssetUrls(pageUrl, pageHtml) {
  const urls = [];
  const seen = new Set();
  const assetPattern = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/gi;
  for (const match of pageHtml.matchAll(assetPattern)) {
    const value = match[1];
    const assetUrl = toSameOriginUrl(pageUrl, value);
    if (!assetUrl || seen.has(assetUrl)) continue;
    seen.add(assetUrl);
    urls.push(assetUrl);
  }
  return urls;
}

function toSameOriginUrl(pageUrl, value) {
  try {
    const url = new URL(value, pageUrl);
    return url.origin === pageUrl.origin ? url.toString() : null;
  } catch {
    return null;
  }
}

async function postJson(url, body) {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch (error) {
    issues.push(`${url.pathname} request failed: ${formatError(error)}`);
    return null;
  }
}

function hasReleaseSecurityHeaders(headers) {
  return collectReleaseSecurityHeaderIssues("response", headers).length === 0;
}

function collectReleaseSecurityHeaderIssues(label, headers) {
  const headerIssues = [];
  for (const { name, header, expected } of RELEASE_SECURITY_HEADERS) {
    const actual = headers.get(header);
    if (!actual) {
      headerIssues.push(`${label} is missing ${name}`);
      continue;
    }
    if (expected && actual !== expected) {
      headerIssues.push(`${label} should return ${name}: ${expected} (got ${actual})`);
    }
  }
  return headerIssues;
}

function parseHttpsUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      return url;
    }
    return null;
  } catch {
    return null;
  }
}

function isSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
