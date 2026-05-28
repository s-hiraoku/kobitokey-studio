import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const checker = resolve("scripts/check-browser-firmware-merge-readiness.mjs");
const root = mkdtempSync(join(tmpdir(), "browser-firmware-merge-readiness-"));

try {
  const cleanRepo = createRepo(join(root, "clean"));
  const clean = runChecker(cleanRepo);
  assert(clean.status === 0, "Expected clean merge-ready repository to pass", clean);
  assert(clean.stdout.includes("OK browser firmware branch can merge origin/main"), "Expected clean repository success output", clean);

  writeFileSync(join(cleanRepo, "dirty.txt"), "dirty\n");
  const dirty = runChecker(cleanRepo);
  assert(dirty.status !== 0, "Expected dirty repository to fail", dirty);
  assert(dirty.stderr.includes("working tree is dirty"), "Expected dirty repository to explain dirty worktree", dirty);

  const dirtyAllowed = runChecker(cleanRepo, ["--allow-dirty"]);
  assert(dirtyAllowed.status === 0, "Expected --allow-dirty repository to pass", dirtyAllowed);

  const behindRepo = createBehindRepo(join(root, "behind"));
  const behind = runChecker(behindRepo);
  assert(behind.status !== 0, "Expected branch behind origin/main to fail", behind);
  assert(behind.stderr.includes("current branch is behind origin/main by 1 commit(s)"), "Expected behind branch issue", behind);
  assert(
    behind.stderr.includes("files changed on both branch and origin/main: src/styles.css"),
    "Expected overlapping changed file warning",
    behind,
  );

  const conflictRepo = createConflictRepo(join(root, "conflict"));
  const conflict = runChecker(conflictRepo, ["--allow-dirty"]);
  assert(conflict.status !== 0, "Expected non-destructive merge conflict to fail", conflict);
  assert(conflict.stderr.includes("non-destructive merge check failed for origin/main"), "Expected merge conflict issue", conflict);

  console.log("OK browser firmware merge readiness self-test passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}

function createRepo(repo) {
  mkdirSync(repo, { recursive: true });
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "release@example.invalid"]);
  git(repo, ["config", "user.name", "Release QA"]);
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src/styles.css"), "base-a\nbase-b\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "base"]);
  git(repo, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  git(repo, ["checkout", "-b", "feature/firmware-mode"]);
  return repo;
}

function createBehindRepo(repo) {
  createRepo(repo);
  writeFileSync(join(repo, "src/styles.css"), "feature-a\nbase-b\n");
  git(repo, ["add", "src/styles.css"]);
  git(repo, ["commit", "-m", "feature styles"]);
  git(repo, ["checkout", "main"]);
  writeFileSync(join(repo, "src/styles.css"), "base-a\nmain-b\n");
  git(repo, ["add", "src/styles.css"]);
  git(repo, ["commit", "-m", "main styles"]);
  git(repo, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  git(repo, ["checkout", "feature/firmware-mode"]);
  return repo;
}

function createConflictRepo(repo) {
  createRepo(repo);
  writeFileSync(join(repo, "src/styles.css"), "feature-only\n");
  git(repo, ["add", "src/styles.css"]);
  git(repo, ["commit", "-m", "feature conflict"]);
  git(repo, ["checkout", "main"]);
  writeFileSync(join(repo, "src/styles.css"), "main-only\n");
  git(repo, ["add", "src/styles.css"]);
  git(repo, ["commit", "-m", "main conflict"]);
  git(repo, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  git(repo, ["checkout", "feature/firmware-mode"]);
  return repo;
}

function runChecker(cwd, extraArgs = []) {
  return spawnSync(process.execPath, [checker, ...extraArgs], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function git(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function assert(condition, message, result) {
  if (!condition) {
    if (result) {
      process.stderr.write(result.stdout || "");
      process.stderr.write(result.stderr || "");
    }
    throw new Error(message);
  }
}
