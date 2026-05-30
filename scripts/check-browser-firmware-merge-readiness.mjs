import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const allowDirty = args.includes("--allow-dirty");
const mainRef =
  args.find((arg) => !arg.startsWith("--")) ||
  process.env.BROWSER_FIRMWARE_MAIN_REF ||
  "origin/main";

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: node scripts/check-browser-firmware-merge-readiness.mjs [main-ref] [--allow-dirty]

Checks whether the current browser Firmware Mode branch is ready to merge with
the main release branch without touching the index or working tree.

Default main ref:
  origin/main`);
  process.exit(0);
}

const issues = [];
const warnings = [];

ensureGitRepository();
const head = git(["rev-parse", "--short", "HEAD"], "read current HEAD").stdout.trim();
const target = git(["rev-parse", "--short", "--verify", mainRef], `read ${mainRef}`).stdout.trim();
const status = git(["status", "--porcelain"], "read worktree status").stdout.trim();
if (status && !allowDirty) {
  issues.push("working tree is dirty; commit or stash browser Firmware Mode changes before merging main");
}

const counts = git(["rev-list", "--left-right", "--count", `HEAD...${mainRef}`], `compare HEAD with ${mainRef}`)
  .stdout.trim()
  .split(/\s+/)
  .map((value) => Number(value));
const ahead = counts[0] || 0;
const behind = counts[1] || 0;
if (behind > 0) {
  issues.push(`current branch is behind ${mainRef} by ${behind} commit(s); merge or rebase main before release`);
}

const mergeBase = git(["merge-base", "HEAD", mainRef], `find merge base with ${mainRef}`).stdout.trim();
const merge = spawnGit(["merge-tree", mergeBase, "HEAD", mainRef]);
if (merge.status !== 0) {
  const detail = merge.stderr.trim() || merge.stdout.trim() || `exit status ${merge.status}`;
  issues.push(`non-destructive merge check failed for ${mainRef}: ${detail}`);
} else if (merge.stdout.includes("<<<<<<< .our") || merge.stdout.includes("changed in both")) {
  const detail = merge.stdout.split(/\r?\n/).slice(0, 12).join("\n").trim();
  issues.push(`non-destructive merge check failed for ${mainRef}: ${detail}`);
}

const ourFiles = new Set(changedFiles(`${mergeBase}..HEAD`));
const theirFiles = new Set(changedFiles(`${mergeBase}..${mainRef}`));
const overlappingFiles = [...ourFiles].filter((file) => theirFiles.has(file)).sort();
if (overlappingFiles.length > 0) {
  warnings.push(`files changed on both branch and ${mainRef}: ${overlappingFiles.join(", ")}`);
}

if (issues.length > 0) {
  console.error(`Browser firmware branch is not ready to merge ${mainRef} into ${head}:`);
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  for (const warning of warnings) {
    console.error(`- ${warning}`);
  }
  console.error(`Ahead/behind relative to ${mainRef}: ahead ${ahead}, behind ${behind}`);
  process.exit(1);
}

for (const warning of warnings) {
  console.warn(`WARN ${warning}`);
}
console.log(`OK browser firmware branch can merge ${mainRef} into ${head} without release-blocking conflicts`);
console.log(`Ahead/behind relative to ${mainRef}: ahead ${ahead}, behind ${behind}`);

function ensureGitRepository() {
  const result = spawnGit(["rev-parse", "--is-inside-work-tree"]);
  if (result.status !== 0 || result.stdout.trim() !== "true") {
    console.error("Not inside a git worktree");
    process.exit(1);
  }
}

function changedFiles(range) {
  return git(["diff", "--name-only", range], `list changed files for ${range}`)
    .stdout.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function git(args, description) {
  const result = spawnGit(args);
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    console.error(`Failed to ${description}: ${detail}`);
    process.exit(result.status ?? 1);
  }
  return result;
}

function spawnGit(args) {
  return spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}
