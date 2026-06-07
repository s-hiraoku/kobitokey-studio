import { describe, expect, it } from "vitest";
import {
  BROWSER_FIRMWARE_SESSION_KEY,
  readBrowserFirmwareSession,
  sanitizeBrowserFirmwareSession,
  writeBrowserFirmwareSession,
} from "./browserFirmwareSession";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("browser firmware session", () => {
  it("stores only resumable metadata and excludes token or artifact bytes", () => {
    const storage = new MemoryStorage();

    writeBrowserFirmwareSession(
      {
        branch: "main",
        buildStatus: "success",
        commitSha: "abc123",
        commitUrl: "https://github.com/owner/repo/commit/abc123",
        leftFlashed: true,
        repoUrl: "https://github.com/owner/repo",
        rightFlashed: false,
        runId: 123,
        runUrl: "https://github.com/owner/repo/actions/runs/123",
        // Runtime-only fields must never be serialized, even if a caller passes
        // a widened object by mistake.
        token: "secret",
        uf2Bytes: [1, 2, 3],
      } as never,
      storage,
    );

    const raw = storage.getItem(BROWSER_FIRMWARE_SESSION_KEY);
    expect(raw).not.toContain("secret");
    expect(raw).not.toContain("uf2Bytes");
    expect(readBrowserFirmwareSession(storage)).toEqual({
      branch: "main",
      buildStatus: "success",
      commitSha: "abc123",
      commitUrl: "https://github.com/owner/repo/commit/abc123",
      leftFlashed: true,
      repoUrl: "https://github.com/owner/repo",
      rightFlashed: false,
      runId: 123,
      runUrl: "https://github.com/owner/repo/actions/runs/123",
    });
  });

  it("persists repository and branch preferences before a build exists", () => {
    const storage = new MemoryStorage();

    writeBrowserFirmwareSession(
      {
        branch: "feature/browser-build",
        buildStatus: "idle",
        commitSha: null,
        commitUrl: "",
        leftFlashed: false,
        repoUrl: "s-hiraoku/KobitoKey_QWERTY",
        rightFlashed: false,
        runId: null,
        runUrl: "",
      },
      storage,
    );

    expect(readBrowserFirmwareSession(storage)).toMatchObject({
      branch: "feature/browser-build",
      buildStatus: "idle",
      commitSha: null,
      repoUrl: "s-hiraoku/KobitoKey_QWERTY",
      runId: null,
    });
  });

  it("sanitizes corrupt or partial persisted state", () => {
    expect(
      sanitizeBrowserFirmwareSession({
        branch: "",
        buildStatus: "done" as never,
        commitSha: "",
        commitUrl: "https://github.com/owner/repo/commit/stale",
        leftFlashed: 1 as never,
        repoUrl: "",
        rightFlashed: 0 as never,
        runId: "123" as never,
        runUrl: "https://github.com/owner/repo/actions/runs/123",
      }),
    ).toEqual({
      branch: "main",
      buildStatus: "idle",
      commitSha: null,
      commitUrl: "",
      leftFlashed: false,
      repoUrl: "https://github.com/juichi50iii/KobitoKey_QWERTY",
      rightFlashed: false,
      runId: null,
      runUrl: "",
    });
  });

  it("drops unsafe persisted GitHub URLs and invalid commit metadata", () => {
    expect(
      sanitizeBrowserFirmwareSession({
        branch: "main",
        buildStatus: "success",
        commitSha: "not-a-sha",
        commitUrl: "javascript:alert(1)",
        leftFlashed: true,
        repoUrl: "https://github.com/owner/repo/tree/main",
        rightFlashed: true,
        runId: 123,
        runUrl: "https://evil.example/actions/runs/123",
      }),
    ).toEqual({
      branch: "main",
      buildStatus: "idle",
      commitSha: null,
      commitUrl: "",
      leftFlashed: false,
      repoUrl: "https://github.com/juichi50iii/KobitoKey_QWERTY",
      rightFlashed: false,
      runId: null,
      runUrl: "",
    });
  });

  it("keeps safe GitHub resume links only when they match the stored commit and run", () => {
    expect(
      sanitizeBrowserFirmwareSession({
        branch: "main",
        buildStatus: "success",
        commitSha: "abc123",
        commitUrl: "https://github.com/owner/repo/commit/abc123",
        leftFlashed: false,
        repoUrl: "owner/repo",
        rightFlashed: false,
        runId: 123,
        runUrl: "https://github.com/owner/repo/actions/runs/123",
      }),
    ).toMatchObject({
      buildStatus: "success",
      commitSha: "abc123",
      commitUrl: "https://github.com/owner/repo/commit/abc123",
      repoUrl: "owner/repo",
      runId: 123,
      runUrl: "https://github.com/owner/repo/actions/runs/123",
    });

    expect(
      sanitizeBrowserFirmwareSession({
        branch: "main",
        buildStatus: "success",
        commitSha: "abc123",
        commitUrl: "https://github.com/owner/repo/commit/other",
        repoUrl: "https://github.com/owner/repo",
        runId: 123,
        runUrl: "https://github.com/owner/repo/actions/runs/456",
      }),
    ).toMatchObject({
      commitUrl: "",
      runUrl: "",
    });

    expect(
      sanitizeBrowserFirmwareSession({
        branch: "main",
        buildStatus: "success",
        commitSha: "abc123",
        commitUrl: "https://github.com/other/repo/commit/abc123",
        repoUrl: "https://github.com/owner/repo",
        runId: 123,
        runUrl: "https://github.com/owner/other/actions/runs/123",
      }),
    ).toMatchObject({
      commitUrl: "",
      runUrl: "",
    });
  });

  it("drops dependent resume state when its prerequisites are missing", () => {
    expect(
      sanitizeBrowserFirmwareSession({
        branch: "main",
        buildStatus: "success",
        commitSha: null,
        commitUrl: "https://github.com/owner/repo/commit/stale",
        leftFlashed: true,
        repoUrl: "https://github.com/owner/repo",
        rightFlashed: true,
        runId: 123,
        runUrl: "https://github.com/owner/repo/actions/runs/123",
      }),
    ).toMatchObject({
      buildStatus: "idle",
      commitSha: null,
      commitUrl: "",
      leftFlashed: false,
      rightFlashed: false,
      runId: null,
      runUrl: "",
    });

    expect(
      sanitizeBrowserFirmwareSession({
        branch: "main",
        buildStatus: "success",
        commitSha: "abc123",
        leftFlashed: true,
        repoUrl: "https://github.com/owner/repo",
        rightFlashed: true,
        runId: null,
      }),
    ).toMatchObject({
      buildStatus: "idle",
      leftFlashed: false,
      rightFlashed: false,
      runId: null,
    });
  });

  it("prevents impossible flash progress from being restored", () => {
    expect(
      sanitizeBrowserFirmwareSession({
        branch: "main",
        buildStatus: "success",
        commitSha: "abc123",
        leftFlashed: false,
        repoUrl: "https://github.com/owner/repo",
        rightFlashed: true,
        runId: 123,
      }),
    ).toMatchObject({
      buildStatus: "success",
      leftFlashed: false,
      rightFlashed: false,
      runId: 123,
    });
  });

  it("trims persisted branch names before resuming GitHub API calls", () => {
    expect(
      sanitizeBrowserFirmwareSession({
        branch: " feature/firmware-mode ",
        buildStatus: "idle",
        commitSha: null,
        repoUrl: "https://github.com/owner/repo",
      }),
    ).toMatchObject({
      branch: "feature/firmware-mode",
    });
  });
});
