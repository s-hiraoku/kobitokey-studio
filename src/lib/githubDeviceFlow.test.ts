import { describe, expect, it, vi } from "vitest";
import { hasGitHubOAuthScope, pollGitHubDeviceToken, requestGitHubDeviceCode } from "./githubDeviceFlow";

describe("requestGitHubDeviceCode", () => {
  it("requests a device code with client id and scope", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        device_code: "device",
        user_code: "USER-CODE",
        verification_uri_complete: "https://github.com/login/device?user_code=USER-CODE",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
        interval: 5,
      }),
    );

    await expect(
      requestGitHubDeviceCode({ clientId: "client", scope: "repo", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toEqual({
      deviceCode: "device",
      userCode: "USER-CODE",
      verificationUriComplete: "https://github.com/login/device?user_code=USER-CODE",
      verificationUri: "https://github.com/login/device",
      expiresIn: 900,
      interval: 5,
    });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe("/api/github/device-code");
    expect(JSON.parse(String(init.body))).toEqual({ clientId: "client", scope: "repo" });
  });

  it("reports GitHub OAuth error responses", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        error: "incorrect_client_credentials",
        error_description: "Client id is invalid",
      }),
    );

    await expect(
      requestGitHubDeviceCode({ clientId: "bad", scope: "repo", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow("Client id is invalid");
  });

  it("rejects incomplete device-code responses", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        user_code: "USER-CODE",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
      }),
    );

    await expect(
      requestGitHubDeviceCode({ clientId: "client", scope: "repo", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow("GitHub OAuth device code response was incomplete");
  });
});

describe("pollGitHubDeviceToken", () => {
  it("waits through authorization_pending and returns an access token", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "authorization_pending" }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "token", scope: "repo", token_type: "bearer" }));

    const promise = pollGitHubDeviceToken({
      clientId: "client",
      deviceCode: "device",
      interval: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toEqual({
      accessToken: "token",
      scope: "repo",
      tokenType: "bearer",
    });
    expect((fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>).map((call) => call[0])).toEqual([
      "/api/github/access-token",
      "/api/github/access-token",
    ]);
    vi.useRealTimers();
  });

  it("reports terminal OAuth polling errors", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        error: "expired_token",
        error_description: "Device code expired",
      }),
    );

    const promise = pollGitHubDeviceToken({
      clientId: "client",
      deviceCode: "device",
      interval: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const expectation = expect(promise).rejects.toThrow("Device code expired");
    await vi.advanceTimersByTimeAsync(1000);

    await expectation;
    vi.useRealTimers();
  });

  it("stops polling when the device code expiry would be exceeded", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "authorization_pending" }));

    const promise = pollGitHubDeviceToken({
      clientId: "client",
      deviceCode: "device",
      expiresIn: 2,
      interval: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const expectation = expect(promise).rejects.toThrow("GitHub device code の有効期限が切れました");
    await vi.advanceTimersByTimeAsync(1000);

    await expectation;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("hasGitHubOAuthScope", () => {
  it("accepts comma or space separated GitHub OAuth scopes", () => {
    expect(hasGitHubOAuthScope("repo,gist", "repo")).toBe(true);
    expect(hasGitHubOAuthScope("read:user repo", "repo")).toBe(true);
  });

  it("does not treat public_repo as the full repo scope", () => {
    expect(hasGitHubOAuthScope("public_repo", "repo")).toBe(false);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
