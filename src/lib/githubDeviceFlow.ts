export type GitHubDeviceCode = {
  deviceCode: string;
  userCode: string;
  verificationUriComplete?: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
};

export type GitHubDeviceToken = {
  accessToken: string;
  scope: string;
  tokenType: string;
};

type GitHubDeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri_complete?: string;
  verification_uri: string;
  expires_in: number;
  interval?: number;
} | GitHubOAuthErrorResponse;

type GitHubDeviceTokenResponse =
  | {
      access_token: string;
      scope: string;
      token_type: string;
    }
  | GitHubOAuthErrorResponse;

type GitHubOAuthErrorResponse = {
  error: string;
  error_description?: string;
  interval?: number;
};

export async function requestGitHubDeviceCode({
  clientId,
  fetchImpl = fetch,
  scope,
}: {
  clientId: string;
  fetchImpl?: typeof fetch;
  scope: string;
}): Promise<GitHubDeviceCode> {
  const response = await fetchImpl("/api/github/device-code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      clientId,
      scope,
    }),
  });
  const json = await readJson<GitHubDeviceCodeResponse>(response);
  if ("error" in json) {
    throw new Error(oauthErrorMessage(json));
  }
  if (!json.device_code || !json.user_code || !json.verification_uri || !json.expires_in) {
    throw new Error("GitHub OAuth device code response was incomplete");
  }
  return {
    deviceCode: json.device_code,
    userCode: json.user_code,
    verificationUriComplete: json.verification_uri_complete,
    verificationUri: json.verification_uri,
    expiresIn: json.expires_in,
    interval: json.interval ?? 5,
  };
}

export async function pollGitHubDeviceToken({
  clientId,
  deviceCode,
  expiresIn,
  fetchImpl = fetch,
  interval,
  signal,
}: {
  clientId: string;
  deviceCode: string;
  expiresIn?: number;
  fetchImpl?: typeof fetch;
  interval: number;
  signal?: AbortSignal;
}): Promise<GitHubDeviceToken> {
  let nextInterval = Math.max(interval, 1);
  const expiresAt = typeof expiresIn === "number" && expiresIn > 0 ? Date.now() + expiresIn * 1000 : null;
  while (!signal?.aborted) {
    if (expiresAt !== null && Date.now() + nextInterval * 1000 >= expiresAt) {
      throw new Error("GitHub device code の有効期限が切れました。GitHub で接続をやり直してください");
    }
    await delay(nextInterval * 1000, signal);
    const response = await fetchImpl("/api/github/access-token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientId,
        deviceCode,
      }),
      signal,
    });
    const json = await readJson<GitHubDeviceTokenResponse>(response);

    if ("access_token" in json) {
      return {
        accessToken: json.access_token,
        scope: json.scope,
        tokenType: json.token_type,
      };
    }
    if (json.error === "authorization_pending") {
      continue;
    }
    if (json.error === "slow_down") {
      nextInterval = json.interval ?? nextInterval + 5;
      continue;
    }
    throw new Error(oauthErrorMessage(json));
  }
  throw new Error("GitHub device flow was cancelled");
}

export function hasGitHubOAuthScope(scope: string, requiredScope: string): boolean {
  return scope
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(requiredScope);
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`GitHub OAuth ${response.status}: ${body || response.statusText}`);
  }
  return response.json() as Promise<T>;
}

function oauthErrorMessage(error: GitHubOAuthErrorResponse): string {
  return error.error_description || error.error;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new Error("GitHub device flow was cancelled"));
  }
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        globalThis.clearTimeout(timeout);
        reject(new Error("GitHub device flow was cancelled"));
      },
      { once: true },
    );
  });
}
