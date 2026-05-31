import { isGitHubPathSegment } from "./lib/githubValidation";

type WorkerEnv = {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
};

type DeviceCodeRequest = {
  clientId?: string;
  scope?: string;
};

type AccessTokenRequest = {
  clientId?: string;
  deviceCode?: string;
};

type ArtifactZipRequest = {
  artifactId?: number;
  owner?: string;
  repo?: string;
  token?: string;
};

type JsonReadResult<T> = { ok: true; value: T } | { ok: false; response: Response };

declare const __KOBITOKEY_APP_COMMIT_SHA__: string | undefined;

const APP_COMMIT_SHA =
  typeof __KOBITOKEY_APP_COMMIT_SHA__ === "string" && __KOBITOKEY_APP_COMMIT_SHA__.trim()
    ? __KOBITOKEY_APP_COMMIT_SHA__.trim()
    : "development";

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/release-metadata") {
      return withSecurityHeaders(releaseMetadata(request), request);
    }
    if (url.pathname === "/api/github/device-code") {
      return withSecurityHeaders(await proxyDeviceCode(request), request);
    }
    if (url.pathname === "/api/github/access-token") {
      return withSecurityHeaders(await proxyAccessToken(request), request);
    }
    if (url.pathname === "/api/github/artifact-zip") {
      return withSecurityHeaders(await proxyArtifactZip(request), request);
    }
    return withSecurityHeaders(await env.ASSETS.fetch(request), request);
  },
};

function releaseMetadata(request: Request): Response {
  if (request.method !== "GET") {
    const response = json({ error: "method_not_allowed" }, 405);
    response.headers.set("Allow", "GET");
    return response;
  }

  return json({
    schemaVersion: 1,
    appCommitSha: APP_COMMIT_SHA,
  });
}

async function proxyDeviceCode(request: Request): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed();
  const parsed = await readJson<DeviceCodeRequest>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  if (!body.clientId) return json({ error: "client_id_required" }, 400);
  const scope = body.scope ?? "repo";
  if (scope !== "repo") return json({ error: "unsupported_oauth_scope" }, 400);

  const response = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: body.clientId,
      scope,
    }),
  });
  return passthroughJson(response);
}

async function proxyAccessToken(request: Request): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed();
  const parsed = await readJson<AccessTokenRequest>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  if (!body.clientId || !body.deviceCode) return json({ error: "client_id_and_device_code_required" }, 400);

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: body.clientId,
      device_code: body.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });
  return passthroughJson(response);
}

async function proxyArtifactZip(request: Request): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed();
  const parsed = await readJson<ArtifactZipRequest>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  if (!body.owner || !body.repo || !body.artifactId || !body.token) {
    return json({ error: "owner_repo_artifact_id_and_token_required" }, 400);
  }
  if (!isGitHubPathSegment(body.owner) || !isGitHubPathSegment(body.repo)) {
    return json({ error: "invalid_owner_or_repo" }, 400);
  }
  if (!Number.isInteger(body.artifactId) || body.artifactId <= 0) {
    return json({ error: "invalid_artifact_id" }, 400);
  }

  const response = await fetch(
    `https://api.github.com/repos/${body.owner}/${body.repo}/actions/artifacts/${body.artifactId}/zip`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${body.token}`,
        "User-Agent": "kobitokey-studio",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      redirect: "manual",
    },
  );

  if (isRedirect(response.status)) {
    const location = response.headers.get("Location");
    if (!location) {
      return json({ error: "github_artifact_redirect_missing_location", status: response.status }, 502);
    }
    const zipUrl = parseHttpsUrl(location);
    if (!zipUrl) {
      return json({ error: "github_artifact_redirect_invalid_location", status: response.status }, 502);
    }
    const zipResponse = await fetch(zipUrl.toString(), {
      headers: {
        Accept: "application/zip",
        "User-Agent": "kobitokey-studio",
      },
    });
    if (!zipResponse.ok) {
      return json({ error: "github_artifact_download_failed", status: zipResponse.status }, zipResponse.status);
    }
    return artifactZipResponse(zipResponse);
  }

  if (!response.ok) {
    return json({ error: "github_artifact_download_failed", status: response.status }, response.status);
  }
  return artifactZipResponse(response);
}

function artifactZipResponse(response: Response): Response {
  return new Response(response.body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/zip",
    },
  });
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function parseHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

async function readJson<T>(request: Request): Promise<JsonReadResult<T>> {
  try {
    return { ok: true, value: (await request.json()) as T };
  } catch {
    return { ok: false, response: json({ error: "invalid_json" }, 400) };
  }
}

async function passthroughJson(response: Response): Promise<Response> {
  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}

function methodNotAllowed(): Response {
  const response = json({ error: "method_not_allowed" }, 405);
  response.headers.set("Allow", "POST");
  return response;
}

function withSecurityHeaders(response: Response, request: Request): Response {
  const url = new URL(request.url);
  const isLocalDev = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  const secured = new Response(response.body, response);
  secured.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      isLocalDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data:",
      isLocalDev ? "connect-src 'self' https://api.github.com http: ws:" : "connect-src 'self' https://api.github.com",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
  secured.headers.set("Referrer-Policy", "no-referrer");
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("X-Frame-Options", "DENY");
  secured.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  secured.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (!isLocalDev && url.protocol === "https:") {
    secured.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  return secured;
}
