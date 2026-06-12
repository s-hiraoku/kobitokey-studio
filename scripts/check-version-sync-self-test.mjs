import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = mkdtempSync(join(tmpdir(), "kobitokey-version-sync-"));
const checker = resolve("scripts/check-version-sync.mjs");
const setter = resolve("scripts/set-version.mjs");

try {
  const clean = join(root, "clean");
  writeProject(clean, "0.1.0");
  const cleanResult = run(checker, ["--root", clean]);
  assert(cleanResult.status === 0, "Expected synchronized project to pass", cleanResult);
  assert(cleanResult.stdout.includes("OK version 0.1.0 is synchronized"), "Expected synchronized success output", cleanResult);

  const mismatched = join(root, "mismatched");
  writeProject(mismatched, "0.1.0", { cargoVersion: "0.1.1" });
  const mismatchResult = run(checker, ["--root", mismatched]);
  assert(mismatchResult.status !== 0, "Expected mismatched Cargo version to fail", mismatchResult);
  assert(
    mismatchResult.stderr.includes('src-tauri/Cargo.toml version is "0.1.1"; expected "0.1.0"'),
    "Expected mismatch output to name Cargo.toml",
    mismatchResult,
  );

  const missingChangelog = join(root, "missing-changelog");
  writeProject(missingChangelog, "0.1.0", { changelog: "# Changelog\n" });
  const missingChangelogResult = run(checker, ["--root", missingChangelog]);
  assert(missingChangelogResult.status !== 0, "Expected missing changelog entry to fail", missingChangelogResult);
  assert(
    missingChangelogResult.stderr.includes("CHANGELOG.md is missing an entry for 0.1.0"),
    "Expected missing changelog output",
    missingChangelogResult,
  );

  const updated = join(root, "updated");
  writeProject(updated, "0.1.0");
  const dryRun = run(setter, ["1.2.3-beta.1", "--root", updated, "--dry-run"]);
  assert(dryRun.status === 0, "Expected set-version dry-run to pass", dryRun);
  assert(run(checker, ["--root", updated]).stdout.includes("OK version 0.1.0"), "Expected dry-run not to write files");

  const setResult = run(setter, ["1.2.3-beta.1", "--root", updated, "--date", "2026-06-12"]);
  assert(setResult.status === 0, "Expected set-version to pass", setResult);
  const updatedCheck = run(checker, ["--root", updated, "--json"]);
  assert(updatedCheck.status === 0, "Expected updated project to pass", updatedCheck);
  const payload = JSON.parse(updatedCheck.stdout);
  assert(payload.version === "1.2.3-beta.1", "Expected checker JSON to report updated version", updatedCheck);

  console.log("OK version sync self-test passed");
} finally {
  rmSync(root, { recursive: true, force: true });
}

function writeProject(projectRoot, version, options = {}) {
  mkdirSync(join(projectRoot, "src-tauri"), { recursive: true });
  writeFileSync(
    join(projectRoot, "package.json"),
    `${JSON.stringify({ name: "kobitokey-studio", private: true, version }, null, 2)}\n`,
  );
  writeFileSync(
    join(projectRoot, "package-lock.json"),
    `${JSON.stringify(
      {
        name: "kobitokey-studio",
        version: options.lockVersion ?? version,
        lockfileVersion: 3,
        requires: true,
        packages: {
          "": {
            name: "kobitokey-studio",
            version: options.lockRootVersion ?? version,
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(projectRoot, "src-tauri/Cargo.toml"),
    `[package]\nname = "kobitokey-studio"\nversion = "${options.cargoVersion ?? version}"\nedition = "2021"\n\n[dependencies]\n`,
  );
  writeFileSync(
    join(projectRoot, "src-tauri/tauri.conf.json"),
    `${JSON.stringify({ productName: "KobitoKey Studio", version: options.tauriVersion ?? version }, null, 2)}\n`,
  );
  writeFileSync(
    join(projectRoot, "CHANGELOG.md"),
    options.changelog ?? `# Changelog\n\n## [${version}] - 2026-06-12\n\n- Test release.\n`,
  );
}

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: resolve("."),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
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
