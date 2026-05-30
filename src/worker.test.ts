import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./worker";

const env = {
  ASSETS: {
    fetch: vi.fn(async () => new Response("asset")),
  },
};

describe("worker GitHub API proxy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    env.ASSETS.fetch.mockClear();
  });

  it("proxies GitHub device-code requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        device_code: "device",
        user_code: "USER",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
      }),
    );

    const response = await worker.fetch(
      jsonRequest("https://app.example/api/github/device-code", {
        clientId: "client",
        scope: "repo",
      }),
      env,
    );

    await expect(response.json()).resolves.toMatchObject({ device_code: "device" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://github.com/login/device/code",
      expect.objectContaining({
        method: "POST",
        body: new URLSearchParams({ client_id: "client", scope: "repo" }),
      }),
    );
  });

  it("defaults GitHub device-code scope to repo", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        device_code: "device",
        user_code: "USER",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
      }),
    );

    await worker.fetch(
      jsonRequest("https://app.example/api/github/device-code", {
        clientId: "client",
      }),
      env,
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://github.com/login/device/code",
      expect.objectContaining({
        body: new URLSearchParams({ client_id: "client", scope: "repo" }),
      }),
    );
  });

  it("rejects unsupported GitHub OAuth scopes before calling GitHub", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await worker.fetch(
      jsonRequest("https://app.example/api/github/device-code", {
        clientId: "client",
        scope: "admin:org",
      }),
      env,
    );

    await expect(response.json()).resolves.toEqual({ error: "unsupported_oauth_scope" });
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("proxies GitHub access-token polling requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        access_token: "token",
        scope: "repo",
        token_type: "bearer",
      }),
    );

    const response = await worker.fetch(
      jsonRequest("https://app.example/api/github/access-token", {
        clientId: "client",
        deviceCode: "device",
      }),
      env,
    );

    await expect(response.json()).resolves.toMatchObject({ access_token: "token" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://github.com/login/oauth/access_token",
      expect.objectContaining({
        method: "POST",
        body: new URLSearchParams({
          client_id: "client",
          device_code: "device",
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      }),
    );
  });

  it("validates required GitHub proxy inputs", async () => {
    const response = await worker.fetch(jsonRequest("https://app.example/api/github/access-token", { clientId: "client" }), env);

    await expect(response.json()).resolves.toEqual({ error: "client_id_and_device_code_required" });
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects malformed JSON before calling GitHub", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await worker.fetch(
      new Request("https://app.example/api/github/device-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      env,
    );

    await expect(response.json()).resolves.toEqual({ error: "invalid_json" });
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects non-POST API requests with an Allow header", async () => {
    const response = await worker.fetch(new Request("https://app.example/api/github/device-code"), env);

    await expect(response.json()).resolves.toEqual({ error: "method_not_allowed" });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it("proxies artifact zip downloads with the provided token", async () => {
    const zip = new Uint8Array([1, 2, 3]);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(zip));

    const response = await worker.fetch(
      jsonRequest("https://app.example/api/github/artifact-zip", {
        artifactId: 123,
        owner: "owner",
        repo: "repo",
        token: "token",
      }),
      env,
    );

    expect(new Uint8Array(await response.arrayBuffer())).toEqual(zip);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/actions/artifacts/123/zip",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token",
        }),
      }),
    );
  });

  it("follows artifact zip redirects without forwarding the GitHub token", async () => {
    const zip = new Uint8Array([4, 5, 6]);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "https://pipelines.actions.githubusercontent.com/artifacts/zip" },
        }),
      )
      .mockResolvedValueOnce(new Response(zip));

    const response = await worker.fetch(
      jsonRequest("https://app.example/api/github/artifact-zip", {
        artifactId: 123,
        owner: "owner",
        repo: "repo",
        token: "secret-token",
      }),
      env,
    );

    expect(new Uint8Array(await response.arrayBuffer())).toEqual(zip);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/repos/owner/repo/actions/artifacts/123/zip",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token",
        }),
        redirect: "manual",
      }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "https://pipelines.actions.githubusercontent.com/artifacts/zip",
      expect.objectContaining({
        headers: expect.not.objectContaining({
          Authorization: expect.any(String),
        }),
      }),
    );
  });

  it("rejects unsafe artifact redirect locations", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "http://example.test/artifact.zip" },
      }),
    );

    const response = await worker.fetch(
      jsonRequest("https://app.example/api/github/artifact-zip", {
        artifactId: 123,
        owner: "owner",
        repo: "repo",
        token: "secret-token",
      }),
      env,
    );

    await expect(response.json()).resolves.toEqual({ error: "github_artifact_redirect_invalid_location", status: 302 });
    expect(response.status).toBe(502);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed artifact redirect locations", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "://not-a-url" },
      }),
    );

    const response = await worker.fetch(
      jsonRequest("https://app.example/api/github/artifact-zip", {
        artifactId: 123,
        owner: "owner",
        repo: "repo",
        token: "secret-token",
      }),
      env,
    );

    await expect(response.json()).resolves.toEqual({ error: "github_artifact_redirect_invalid_location", status: 302 });
    expect(response.status).toBe(502);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("validates artifact proxy path inputs before calling GitHub", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await worker.fetch(
      jsonRequest("https://app.example/api/github/artifact-zip", {
        artifactId: 123,
        owner: "owner/name",
        repo: "repo",
        token: "token",
      }),
      env,
    );

    await expect(response.json()).resolves.toEqual({ error: "invalid_owner_or_repo" });
    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("validates artifact ids before calling GitHub", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await worker.fetch(
      jsonRequest("https://app.example/api/github/artifact-zip", {
        artifactId: -1,
        owner: "owner",
        repo: "repo",
        token: "token",
      }),
      env,
    );

    await expect(response.json()).resolves.toEqual({ error: "invalid_artifact_id" });
    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sanitizes failed artifact download responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Not Found", documentation_url: "https://docs.github.com/rest" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await worker.fetch(
      jsonRequest("https://app.example/api/github/artifact-zip", {
        artifactId: 123,
        owner: "owner",
        repo: "repo",
        token: "secret-token",
      }),
      env,
    );

    await expect(response.json()).resolves.toEqual({ error: "github_artifact_download_failed", status: 404 });
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("falls back to static assets for other requests", async () => {
    const response = await worker.fetch(new Request("https://app.example/"), env);

    await expect(response.text()).resolves.toBe("asset");
    expect(env.ASSETS.fetch).toHaveBeenCalledOnce();
  });

  it("exposes release metadata through the Worker", async () => {
    const response = await worker.fetch(new Request("https://app.example/api/release-metadata"), env);

    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: 1,
      appCommitSha: "development",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Security-Policy")).toContain("connect-src 'self' https://api.github.com");
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("rejects non-GET release metadata requests with an Allow header", async () => {
    const response = await worker.fetch(
      new Request("https://app.example/api/release-metadata", {
        method: "POST",
      }),
      env,
    );

    await expect(response.json()).resolves.toEqual({ error: "method_not_allowed" });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("adds browser security headers to static asset responses", async () => {
    const response = await worker.fetch(new Request("https://app.example/"), env);

    expect(response.headers.get("Content-Security-Policy")).toContain("connect-src 'self' https://api.github.com");
    expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Permissions-Policy")).toContain("camera=()");
  });

  it("allows Vite dev preamble under local development hosts", async () => {
    const response = await worker.fetch(new Request("http://127.0.0.1:1420/"), env);

    expect(response.headers.get("Content-Security-Policy")).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(response.headers.get("Content-Security-Policy")).toContain("connect-src 'self' https://api.github.com http: ws:");
  });

  it("adds browser security headers to API responses without losing no-store", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await worker.fetch(
      jsonRequest("https://app.example/api/github/device-code", {
        clientId: "client",
        scope: "admin:org",
      }),
      env,
    );

    await expect(response.json()).resolves.toEqual({ error: "unsupported_oauth_scope" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Security-Policy")).toContain("connect-src 'self' https://api.github.com");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Permissions-Policy")).toContain("camera=()");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
