import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import {
  classifyUf2ArtifactsFromManifests,
  commitGitHubFirmwareFiles,
  downloadGitHubFirmwareArtifacts,
  dispatchGitHubFirmwareBuild,
  extractFirmwareArtifactEntriesFromZip,
  extractUf2FilesFromZip,
  findGitHubFirmwareBuildRun,
  getGitHubFirmwareBuildRun,
  readGitHubFirmwareProjectSnapshot,
  readGitHubFirmwareProject,
  readGitHubTextFile,
} from "./githubFirmwareClient";

const ref = { owner: "juichi50iii", repo: "KobitoKey_QWERTY" };

describe("readGitHubFirmwareProject", () => {
  it("reads the three managed firmware files from GitHub contents API", async () => {
    const fetches: string[] = [];
    const fetchImpl = async (url: string | URL | Request) => {
      fetches.push(String(url));
      return jsonResponse({
        encoding: "base64",
        content: btoa(`contents:${String(url).split("/contents/")[1].split("?")[0]}`),
      });
    };

    await expect(
      readGitHubFirmwareProject(ref, "main", { fetchImpl: fetchImpl as typeof fetch, token: "token" }),
    ).resolves.toEqual({
      keymap: "contents:config/KobitoKey.keymap",
      leftOverlay: "contents:config/boards/shields/KobitoKey/KobitoKey_left.overlay",
      rightOverlay: "contents:config/boards/shields/KobitoKey/KobitoKey_right.overlay",
    });
    expect(fetches).toHaveLength(3);
  });

  it("reads managed firmware files at a stable branch head snapshot", async () => {
    const fetches: string[] = [];
    const fetchImpl = async (url: string | URL | Request) => {
      fetches.push(String(url));
      if (String(url).endsWith("/git/ref/heads/main")) {
        return jsonResponse({ object: { sha: "head-sha" } });
      }
      return jsonResponse({
        encoding: "base64",
        content: btoa(`contents:${String(url).split("/contents/")[1].split("?")[0]}`),
      });
    };

    await expect(
      readGitHubFirmwareProjectSnapshot(ref, "main", { fetchImpl: fetchImpl as typeof fetch, token: "token" }),
    ).resolves.toEqual({
      files: {
        keymap: "contents:config/KobitoKey.keymap",
        leftOverlay: "contents:config/boards/shields/KobitoKey/KobitoKey_left.overlay",
        rightOverlay: "contents:config/boards/shields/KobitoKey/KobitoKey_right.overlay",
      },
      headSha: "head-sha",
    });
    expect(fetches[1]).toContain("ref=head-sha");
  });
});

describe("GitHub API error messages", () => {
  it("adds the next action to authentication and permission failures", async () => {
    const fetchImpl = async () => jsonResponse({ message: "Bad credentials" }, 401);

    await expect(
      readGitHubTextFile(ref, "config/KobitoKey.keymap", "main", {
        fetchImpl: fetchImpl as typeof fetch,
        token: "bad-token",
      }),
    ).rejects.toThrow("次の操作: GitHub で再接続するか、repository 書き込みと Actions 実行権限のある token を入力してください");
  });

  it("explains repository access failures with an actionable check", async () => {
    const fetchImpl = async () => jsonResponse({ message: "Not Found" }, 404);

    await expect(
      readGitHubTextFile(ref, "config/KobitoKey.keymap", "main", {
        fetchImpl: fetchImpl as typeof fetch,
        token: "token",
      }),
    ).rejects.toThrow("次の操作: repository、branch、managed firmware file path、または private repository へのアクセス権を確認してください");
  });

  it("explains GitHub rate limits separately from permission failures", async () => {
    const fetchImpl = async () => jsonResponse({ message: "API rate limit exceeded" }, 403);

    await expect(
      readGitHubTextFile(ref, "config/KobitoKey.keymap", "main", {
        fetchImpl: fetchImpl as typeof fetch,
        token: "token",
      }),
    ).rejects.toThrow("次の操作: しばらく待ってから再試行するか、認証済み token で接続し直してください");
  });
});

describe("commitGitHubFirmwareFiles", () => {
  it("creates one git commit containing all managed firmware files", async () => {
    const requests: Array<{ body?: unknown; method: string; url: string }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (String(url).endsWith("/git/ref/heads/main")) {
        return jsonResponse({ object: { sha: "head-sha" } });
      }
      if (String(url).endsWith("/git/commits/head-sha")) {
        return jsonResponse({ sha: "head-sha", tree: { sha: "base-tree" } });
      }
      if (String(url).endsWith("/git/trees")) {
        return jsonResponse({ sha: "next-tree" });
      }
      if (String(url).endsWith("/git/commits")) {
        return jsonResponse({ sha: "next-commit", html_url: "https://github.com/commit", tree: { sha: "next-tree" } });
      }
      if (String(url).endsWith("/git/refs/heads/main")) {
        return jsonResponse({});
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    await expect(
      commitGitHubFirmwareFiles({
        ref,
        branch: "main",
        expectedHeadSha: "head-sha",
        files: { keymap: "keymap", leftOverlay: "left", rightOverlay: "right" },
        options: { fetchImpl: fetchImpl as typeof fetch, token: "token" },
      }),
    ).resolves.toEqual({
      commitSha: "next-commit",
      htmlUrl: "https://github.com/commit",
    });

    expect(requests.map((request) => request.method)).toEqual(["GET", "GET", "POST", "POST", "PATCH"]);
    expect(requests[2].body).toMatchObject({
      base_tree: "base-tree",
      tree: [
        { path: "config/KobitoKey.keymap", content: "keymap" },
        { path: "config/boards/shields/KobitoKey/KobitoKey_left.overlay", content: "left" },
        { path: "config/boards/shields/KobitoKey/KobitoKey_right.overlay", content: "right" },
      ],
    });
    expect(requests[4].body).toEqual({ sha: "next-commit" });
  });

  it("rejects commits when the branch head changed after loading", async () => {
    const requests: string[] = [];
    const fetchImpl = async (url: string | URL | Request) => {
      requests.push(String(url));
      if (String(url).endsWith("/git/ref/heads/main")) {
        return jsonResponse({ object: { sha: "new-head-sha" } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    await expect(
      commitGitHubFirmwareFiles({
        ref,
        branch: "main",
        expectedHeadSha: "old-head-sha",
        files: { keymap: "keymap", leftOverlay: "left", rightOverlay: "right" },
        options: { fetchImpl: fetchImpl as typeof fetch, token: "token" },
      }),
    ).rejects.toThrow("GitHub branch が読み込み後に更新されています");
    expect(requests).toHaveLength(1);
  });
});

describe("GitHub Actions workflow helpers", () => {
  it("dispatches the firmware build workflow", async () => {
    const requests: Array<{ body?: unknown; method: string; url: string }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(null, { status: 204 });
    };

    await dispatchGitHubFirmwareBuild(ref, "main", { fetchImpl: fetchImpl as typeof fetch, token: "token" });

    expect(requests).toEqual([
      {
        url: "https://api.github.com/repos/juichi50iii/KobitoKey_QWERTY/actions/workflows/build.yml/dispatches",
        method: "POST",
        body: { ref: "main" },
      },
    ]);
  });

  it("finds the run that matches the committed SHA", async () => {
    const fetchImpl = async () =>
      jsonResponse({
        workflow_runs: [
          {
            id: 1,
            html_url: "https://github.com/run/1",
            head_sha: "other",
            head_branch: "main",
            status: "completed",
            conclusion: "success",
          },
          {
            id: 2,
            html_url: "https://github.com/run/2",
            head_sha: "target",
            head_branch: "main",
            status: "queued",
            conclusion: null,
          },
        ],
      });

    await expect(
      findGitHubFirmwareBuildRun(ref, "main", "target", { fetchImpl: fetchImpl as typeof fetch, token: "token" }),
    ).resolves.toEqual({
      id: 2,
      htmlUrl: "https://github.com/run/2",
      headSha: "target",
      headBranch: "main",
      status: "queued",
      conclusion: null,
    });
  });

  it("ignores matching workflow run SHAs from other branches", async () => {
    const fetchImpl = async () =>
      jsonResponse({
        workflow_runs: [
          {
            id: 1,
            html_url: "https://github.com/run/1",
            head_sha: "target",
            head_branch: "other-branch",
            status: "completed",
            conclusion: "success",
          },
        ],
      });

    await expect(
      findGitHubFirmwareBuildRun(ref, "main", "target", { fetchImpl: fetchImpl as typeof fetch, token: "token" }),
    ).resolves.toBeNull();
  });

  it("reads a workflow run by id before artifact download", async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      expect(String(url)).toBe("https://api.github.com/repos/juichi50iii/KobitoKey_QWERTY/actions/runs/123");
      return jsonResponse({
        id: 123,
        html_url: "https://github.com/run/123",
        head_sha: "target",
        head_branch: "main",
        status: "completed",
        conclusion: "success",
      });
    };

    await expect(
      getGitHubFirmwareBuildRun(ref, 123, { fetchImpl: fetchImpl as typeof fetch, token: "token" }),
    ).resolves.toEqual({
      id: 123,
      htmlUrl: "https://github.com/run/123",
      headSha: "target",
      headBranch: "main",
      status: "completed",
      conclusion: "success",
    });
  });
});

describe("browser firmware GitHub release flow", () => {
  it("runs the managed file snapshot, commit, dispatch, run lookup, and artifact download flow", async () => {
    const zip = zipSync({
      "firmware/manifest.json": new TextEncoder().encode(
        JSON.stringify({
          outputs: [
            { side: "left", file: "KobitoKey_left.uf2" },
            { side: "right", file: "KobitoKey_right.uf2" },
          ],
        }),
      ),
      "firmware/KobitoKey_left.uf2": new Uint8Array([1]),
      "firmware/KobitoKey_right.uf2": new Uint8Array([2]),
    });
    const requests: Array<{ body?: unknown; method: string; url: string }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const request = {
        url: String(url),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      requests.push(request);

      if (request.url.endsWith("/git/ref/heads/main")) {
        return jsonResponse({ object: { sha: "loaded-head-sha" } });
      }
      if (request.url.includes("/contents/")) {
        expect(request.url).toContain("ref=loaded-head-sha");
        return jsonResponse({
          encoding: "base64",
          content: btoa(`loaded:${request.url.split("/contents/")[1].split("?")[0]}`),
        });
      }
      if (request.url.endsWith("/git/commits/loaded-head-sha")) {
        return jsonResponse({ sha: "loaded-head-sha", tree: { sha: "base-tree" } });
      }
      if (request.url.endsWith("/git/trees")) {
        expect(request.body).toMatchObject({ base_tree: "base-tree" });
        return jsonResponse({ sha: "next-tree" });
      }
      if (request.url.endsWith("/git/commits")) {
        expect(request.body).toMatchObject({ parents: ["loaded-head-sha"], tree: "next-tree" });
        return jsonResponse({
          sha: "commit-sha",
          html_url: "https://github.com/juichi50iii/KobitoKey_QWERTY/commit/commit-sha",
          tree: { sha: "next-tree" },
        });
      }
      if (request.url.endsWith("/git/refs/heads/main")) {
        expect(request.body).toEqual({ sha: "commit-sha" });
        return jsonResponse({});
      }
      if (request.url.endsWith("/actions/workflows/build.yml/dispatches")) {
        expect(request.body).toEqual({ ref: "main" });
        return new Response(null, { status: 204 });
      }
      if (request.url.endsWith("/actions/workflows/build.yml/runs?per_page=20&branch=main")) {
        return jsonResponse({
          workflow_runs: [
            {
              id: 987,
              html_url: "https://github.com/juichi50iii/KobitoKey_QWERTY/actions/runs/987",
              head_sha: "commit-sha",
              head_branch: "main",
              status: "completed",
              conclusion: "success",
            },
          ],
        });
      }
      if (request.url.endsWith("/actions/runs/987")) {
        return jsonResponse({
          id: 987,
          html_url: "https://github.com/juichi50iii/KobitoKey_QWERTY/actions/runs/987",
          head_sha: "commit-sha",
          head_branch: "main",
          status: "completed",
          conclusion: "success",
        });
      }
      if (request.url.endsWith("/actions/runs/987/artifacts")) {
        return jsonResponse({ artifacts: [{ id: 42, name: "firmware", expired: false }] });
      }
      if (request.url === "/api/github/artifact-zip") {
        expect(request.body).toEqual({
          artifactId: 42,
          owner: "juichi50iii",
          repo: "KobitoKey_QWERTY",
          token: "token",
        });
        return new Response(zip);
      }
      throw new Error(`Unexpected URL: ${request.url}`);
    };

    const snapshot = await readGitHubFirmwareProjectSnapshot(ref, "main", {
      fetchImpl: fetchImpl as typeof fetch,
      token: "token",
    });
    const commit = await commitGitHubFirmwareFiles({
      ref,
      branch: "main",
      expectedHeadSha: snapshot.headSha,
      files: {
        keymap: `${snapshot.files.keymap}\n// edited`,
        leftOverlay: snapshot.files.leftOverlay,
        rightOverlay: snapshot.files.rightOverlay,
      },
      options: { fetchImpl: fetchImpl as typeof fetch, token: "token" },
    });
    await dispatchGitHubFirmwareBuild(ref, "main", { fetchImpl: fetchImpl as typeof fetch, token: "token" });
    const run = await findGitHubFirmwareBuildRun(ref, "main", commit.commitSha, {
      fetchImpl: fetchImpl as typeof fetch,
      token: "token",
    });
    const artifacts = await downloadGitHubFirmwareArtifacts(
      ref,
      run?.id ?? 0,
      { fetchImpl: fetchImpl as typeof fetch, token: "token" },
      { expectedHeadSha: commit.commitSha, expectedHeadBranch: "main", requireSuccess: true },
    );

    expect(snapshot.headSha).toBe("loaded-head-sha");
    expect(commit).toEqual({
      commitSha: "commit-sha",
      htmlUrl: "https://github.com/juichi50iii/KobitoKey_QWERTY/commit/commit-sha",
    });
    expect(run).toMatchObject({ id: 987, headSha: "commit-sha", headBranch: "main", conclusion: "success" });
    expect(artifacts).toMatchObject({
      manifestPath: "firmware/manifest.json",
      targets: {
        left: "firmware/KobitoKey_left.uf2",
        right: "firmware/KobitoKey_right.uf2",
        unknown: [],
      },
    });
    expect(requests.map((request) => request.method)).toEqual([
      "GET",
      "GET",
      "GET",
      "GET",
      "GET",
      "GET",
      "POST",
      "POST",
      "PATCH",
      "POST",
      "GET",
      "GET",
      "GET",
      "POST",
    ]);
  });
});

describe("GitHub artifact helpers", () => {
  it("extracts UF2 files from artifact zips", () => {
    const zip = zipSync({
      "KobitoKey_left.uf2": new Uint8Array([1, 2, 3]),
      "nested/KobitoKey_right.uf2": new Uint8Array([4, 5]),
      "README.txt": new Uint8Array([9]),
    });

    expect(extractUf2FilesFromZip(zip)).toEqual([
      { name: "KobitoKey_left.uf2", bytes: new Uint8Array([1, 2, 3]) },
      { name: "nested/KobitoKey_right.uf2", bytes: new Uint8Array([4, 5]) },
    ]);
  });

  it("extracts manifest files from artifact zips", () => {
    const zip = zipSync({
      "firmware/firmware-manifest.json": new TextEncoder().encode(JSON.stringify({ left: "KobitoKey.uf2" })),
      "firmware/KobitoKey.uf2": new Uint8Array([1]),
    });

    expect(extractFirmwareArtifactEntriesFromZip(zip)).toEqual({
      files: [{ name: "firmware/KobitoKey.uf2", bytes: new Uint8Array([1]) }],
      manifests: [
        {
          name: "firmware/firmware-manifest.json",
          contents: JSON.stringify({ left: "KobitoKey.uf2" }),
        },
      ],
    });
  });

  it("uses firmware manifests before filename classification when assigning sides", () => {
    expect(
      classifyUf2ArtifactsFromManifests(["firmware/KobitoKey_A.uf2", "firmware/KobitoKey_B.uf2"], [
        {
          name: "firmware/manifest.json",
          contents: JSON.stringify({
            outputs: [
              { side: "left", file: "KobitoKey_B.uf2" },
              { side: "right", file: "KobitoKey_A.uf2" },
            ],
          }),
        },
      ]),
    ).toEqual({
      manifestPath: "firmware/manifest.json",
      targets: {
        left: "firmware/KobitoKey_B.uf2",
        right: "firmware/KobitoKey_A.uf2",
        unknown: [],
      },
    });
  });

  it("rejects firmware manifests that map left and right to the same UF2", () => {
    expect(
      classifyUf2ArtifactsFromManifests(["firmware/KobitoKey.uf2"], [
        {
          name: "firmware/manifest.json",
          contents: JSON.stringify({
            left: "KobitoKey.uf2",
            right: "KobitoKey.uf2",
          }),
        },
      ]),
    ).toEqual({
      manifestPath: "firmware/manifest.json",
      targets: {
        left: null,
        right: null,
        unknown: ["firmware/KobitoKey.uf2"],
      },
    });
  });

  it("does not reuse a manifest-selected UF2 as the opposite side from filename fallback", () => {
    expect(
      classifyUf2ArtifactsFromManifests(["firmware/KobitoKey_right.uf2"], [
        {
          name: "firmware/manifest.json",
          contents: JSON.stringify({
            left: "KobitoKey_right.uf2",
          }),
        },
      ]),
    ).toEqual({
      manifestPath: "firmware/manifest.json",
      targets: {
        left: "firmware/KobitoKey_right.uf2",
        right: null,
        unknown: [],
      },
    });
  });

  it("downloads active artifacts and classifies left/right UF2 files", async () => {
    const zip = zipSync({
      "KobitoKey_left.uf2": new Uint8Array([1]),
      "KobitoKey_right.uf2": new Uint8Array([2]),
      "firmware-manifest.json": new TextEncoder().encode(
        JSON.stringify({
          left: { file: "KobitoKey_right.uf2" },
          right: { file: "KobitoKey_left.uf2" },
        }),
      ),
    });
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/actions/runs/123/artifacts")) {
        return jsonResponse({
          artifacts: [
            { id: 10, name: "firmware", expired: false },
            { id: 11, name: "old", expired: true },
          ],
        });
      }
      if (String(url) === "/api/github/artifact-zip") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          artifactId: 10,
          owner: "juichi50iii",
          repo: "KobitoKey_QWERTY",
          token: "token",
        });
        return new Response(zip);
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const result = await downloadGitHubFirmwareArtifacts(ref, 123, { fetchImpl: fetchImpl as typeof fetch, token: "token" });

    expect(result.targets).toEqual({
      left: "KobitoKey_right.uf2",
      right: "KobitoKey_left.uf2",
      unknown: [],
    });
    expect(result.manifestPath).toBe("firmware-manifest.json");
    expect(result.files.map((file) => file.name)).toEqual(["KobitoKey_left.uf2", "KobitoKey_right.uf2"]);
  });

  it("does not use a manifest to classify UF2 files from another artifact", async () => {
    const manifestZip = zipSync({
      "firmware-manifest.json": new TextEncoder().encode(
        JSON.stringify({
          left: { file: "KobitoKey_A.uf2" },
          right: { file: "KobitoKey_B.uf2" },
        }),
      ),
    });
    const uf2Zip = zipSync({
      "KobitoKey_A.uf2": new Uint8Array([1]),
      "KobitoKey_B.uf2": new Uint8Array([2]),
    });
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/actions/runs/123/artifacts")) {
        return jsonResponse({
          artifacts: [
            { id: 10, name: "manifest", expired: false },
            { id: 11, name: "firmware", expired: false },
          ],
        });
      }
      if (String(url) === "/api/github/artifact-zip") {
        const body = JSON.parse(String(init?.body));
        if (body.artifactId === 10) return new Response(manifestZip);
        if (body.artifactId === 11) return new Response(uf2Zip);
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const result = await downloadGitHubFirmwareArtifacts(ref, 123, { fetchImpl: fetchImpl as typeof fetch, token: "token" });

    expect(result.manifestPath).toBeUndefined();
    expect(result.targets).toEqual({
      left: null,
      right: null,
      unknown: ["KobitoKey_A.uf2", "KobitoKey_B.uf2"],
    });
  });

  it("verifies the run commit, branch, and success state before downloading artifacts", async () => {
    const zip = zipSync({
      "KobitoKey_left.uf2": new Uint8Array([1]),
      "KobitoKey_right.uf2": new Uint8Array([2]),
    });
    const fetches: string[] = [];
    const fetchImpl = async (url: string | URL | Request) => {
      fetches.push(String(url));
      if (String(url).endsWith("/actions/runs/123")) {
        return jsonResponse({
          id: 123,
          html_url: "https://github.com/run/123",
          head_sha: "target",
          head_branch: "main",
          status: "completed",
          conclusion: "success",
        });
      }
      if (String(url).endsWith("/actions/runs/123/artifacts")) {
        return jsonResponse({ artifacts: [{ id: 10, name: "firmware", expired: false }] });
      }
      if (String(url) === "/api/github/artifact-zip") {
        return new Response(zip);
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    await expect(
      downloadGitHubFirmwareArtifacts(
        ref,
        123,
        { fetchImpl: fetchImpl as typeof fetch, token: "token" },
        { expectedHeadSha: "target", expectedHeadBranch: "main", requireSuccess: true },
      ),
    ).resolves.toMatchObject({
      targets: {
        left: "KobitoKey_left.uf2",
        right: "KobitoKey_right.uf2",
      },
    });
    expect(fetches.slice(0, 2)).toEqual([
      "https://api.github.com/repos/juichi50iii/KobitoKey_QWERTY/actions/runs/123",
      "https://api.github.com/repos/juichi50iii/KobitoKey_QWERTY/actions/runs/123/artifacts",
    ]);
  });

  it("rejects artifact download when the run does not match the expected commit", async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      if (String(url).endsWith("/actions/runs/123")) {
        return jsonResponse({
          id: 123,
          html_url: "https://github.com/run/123",
          head_sha: "other",
          head_branch: "main",
          status: "completed",
          conclusion: "success",
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    await expect(
      downloadGitHubFirmwareArtifacts(
        ref,
        123,
        { fetchImpl: fetchImpl as typeof fetch, token: "token" },
        { expectedHeadSha: "target", requireSuccess: true },
      ),
    ).rejects.toThrow("does not match commit target");
  });

  it("rejects artifact download when the run does not match the expected branch", async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      if (String(url).endsWith("/actions/runs/123")) {
        return jsonResponse({
          id: 123,
          html_url: "https://github.com/run/123",
          head_sha: "target",
          head_branch: "other-branch",
          status: "completed",
          conclusion: "success",
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    await expect(
      downloadGitHubFirmwareArtifacts(
        ref,
        123,
        { fetchImpl: fetchImpl as typeof fetch, token: "token" },
        { expectedHeadSha: "target", expectedHeadBranch: "main", requireSuccess: true },
      ),
    ).rejects.toThrow("does not match branch main");
  });

  it("rejects artifact download before the run succeeds", async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      if (String(url).endsWith("/actions/runs/123")) {
        return jsonResponse({
          id: 123,
          html_url: "https://github.com/run/123",
          head_sha: "target",
          head_branch: "main",
          status: "completed",
          conclusion: "failure",
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    await expect(
      downloadGitHubFirmwareArtifacts(
        ref,
        123,
        { fetchImpl: fetchImpl as typeof fetch, token: "token" },
        { expectedHeadSha: "target", requireSuccess: true },
      ),
    ).rejects.toThrow("is not successful");
  });

  it("rejects successful runs with no artifacts", async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      if (String(url).endsWith("/actions/runs/123/artifacts")) {
        return jsonResponse({ artifacts: [] });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    await expect(downloadGitHubFirmwareArtifacts(ref, 123, { fetchImpl: fetchImpl as typeof fetch, token: "token" })).rejects.toThrow(
      "artifact が見つかりません",
    );
  });

  it("rejects expired artifacts with an action the user can take", async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      if (String(url).endsWith("/actions/runs/123/artifacts")) {
        return jsonResponse({ artifacts: [{ id: 10, name: "firmware", expired: true }] });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    await expect(downloadGitHubFirmwareArtifacts(ref, 123, { fetchImpl: fetchImpl as typeof fetch, token: "token" })).rejects.toThrow(
      "Build 起動で新しい artifact を作成してください",
    );
  });

  it("rejects artifacts that do not contain UF2 files", async () => {
    const zip = zipSync({
      "build.log": new TextEncoder().encode("ok"),
    });
    const fetchImpl = async (url: string | URL | Request) => {
      if (String(url).endsWith("/actions/runs/123/artifacts")) {
        return jsonResponse({ artifacts: [{ id: 10, name: "firmware", expired: false }] });
      }
      if (String(url) === "/api/github/artifact-zip") {
        return new Response(zip);
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    await expect(downloadGitHubFirmwareArtifacts(ref, 123, { fetchImpl: fetchImpl as typeof fetch, token: "token" })).rejects.toThrow(
      "artifact に UF2 が含まれていません",
    );
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
