import { describe, expect, it } from "vitest";
import {
  GITHUB_FIRMWARE_PATHS,
  buildGitHubFirmwareCommitPlan,
  githubContentsUrl,
  githubGitRefUrl,
  githubGitRefsUrl,
  githubWorkflowDispatchUrl,
  githubWorkflowRunsUrl,
  parseGitHubRepositoryRef,
} from "./githubFirmware";

describe("parseGitHubRepositoryRef", () => {
  it("accepts GitHub URL, SSH URL, and owner/repo shorthand", () => {
    expect(parseGitHubRepositoryRef("https://github.com/juichi50iii/KobitoKey_QWERTY")).toEqual({
      owner: "juichi50iii",
      repo: "KobitoKey_QWERTY",
    });
    expect(parseGitHubRepositoryRef("git@github.com:juichi50iii/KobitoKey_QWERTY.git")).toEqual({
      owner: "juichi50iii",
      repo: "KobitoKey_QWERTY",
    });
    expect(parseGitHubRepositoryRef("juichi50iii/KobitoKey_QWERTY")).toEqual({
      owner: "juichi50iii",
      repo: "KobitoKey_QWERTY",
    });
  });

  it("rejects missing or nested repository paths", () => {
    expect(parseGitHubRepositoryRef("")).toBeNull();
    expect(parseGitHubRepositoryRef("https://github.com/juichi50iii")).toBeNull();
    expect(parseGitHubRepositoryRef("https://github.com/juichi50iii/KobitoKey_QWERTY/tree/main")).toBeNull();
  });

  it("rejects repository values that cannot be safe GitHub API path segments", () => {
    expect(parseGitHubRepositoryRef("juichi50iii/KobitoKey_QWERTY?tab=readme")).toBeNull();
    expect(parseGitHubRepositoryRef("juichi50iii/KobitoKey_QWERTY#readme")).toBeNull();
    expect(parseGitHubRepositoryRef("juichi50iii/.hidden")).toBeNull();
  });
});

describe("buildGitHubFirmwareCommitPlan", () => {
  it("maps managed firmware files to repository paths", () => {
    expect(
      buildGitHubFirmwareCommitPlan({
        branch: "main",
        files: {
          keymap: "keymap",
          leftOverlay: "left",
          rightOverlay: "right",
        },
      }),
    ).toEqual({
      branch: "main",
      message: "Update KobitoKey firmware settings",
      files: [
        { path: GITHUB_FIRMWARE_PATHS.keymap, contents: "keymap" },
        { path: GITHUB_FIRMWARE_PATHS.leftOverlay, contents: "left" },
        { path: GITHUB_FIRMWARE_PATHS.rightOverlay, contents: "right" },
      ],
    });
  });

  it("requires an explicit branch", () => {
    expect(() =>
      buildGitHubFirmwareCommitPlan({
        branch: " ",
        files: { keymap: "", leftOverlay: "", rightOverlay: "" },
      }),
    ).toThrow("GitHub branch is required");
  });
});

describe("GitHub API URLs", () => {
  const ref = { owner: "juichi50iii", repo: "KobitoKey_QWERTY" };

  it("builds firmware contents URLs with a branch ref", () => {
    expect(githubContentsUrl(ref, GITHUB_FIRMWARE_PATHS.keymap, "feature/test")).toBe(
      "https://api.github.com/repos/juichi50iii/KobitoKey_QWERTY/contents/config/KobitoKey.keymap?ref=feature%2Ftest",
    );
  });

  it("builds workflow URLs", () => {
    expect(githubWorkflowDispatchUrl(ref)).toBe(
      "https://api.github.com/repos/juichi50iii/KobitoKey_QWERTY/actions/workflows/build.yml/dispatches",
    );
    expect(githubWorkflowRunsUrl(ref, "build.yml", "main")).toBe(
      "https://api.github.com/repos/juichi50iii/KobitoKey_QWERTY/actions/workflows/build.yml/runs?per_page=20&branch=main",
    );
  });

  it("builds branch ref URLs with encoded branch segments", () => {
    expect(githubGitRefUrl(ref, "feature/firmware mode")).toBe(
      "https://api.github.com/repos/juichi50iii/KobitoKey_QWERTY/git/ref/heads/feature/firmware%20mode",
    );
    expect(githubGitRefsUrl(ref, "feature/firmware mode")).toBe(
      "https://api.github.com/repos/juichi50iii/KobitoKey_QWERTY/git/refs/heads/feature/firmware%20mode",
    );
  });
});
