import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const VERSION_FILES = {
  packageJson: "package.json",
  packageLock: "package-lock.json",
  cargoToml: "src-tauri/Cargo.toml",
  tauriConfig: "src-tauri/tauri.conf.json",
  changelog: "CHANGELOG.md",
};

export const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function assertValidVersion(version) {
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Expected a SemVer version such as 1.2.3 or 1.2.3-beta.1, got "${version}"`);
  }
}

export function readVersionState(root = process.cwd()) {
  const packageJson = readJson(root, VERSION_FILES.packageJson);
  const packageLock = readJson(root, VERSION_FILES.packageLock);
  const cargoToml = readText(root, VERSION_FILES.cargoToml);
  const tauriConfig = readJson(root, VERSION_FILES.tauriConfig);
  const changelogPath = join(root, VERSION_FILES.changelog);
  const changelog = existsSync(changelogPath) ? readFileSync(changelogPath, "utf8") : "";

  return {
    root,
    packageJson,
    packageLock,
    cargoToml,
    tauriConfig,
    changelog,
    versions: {
      packageJson: packageJson.version,
      packageLock: packageLock.version,
      packageLockRoot: packageLock.packages?.[""]?.version,
      cargoToml: readCargoPackageVersion(cargoToml),
      tauriConfig: tauriConfig.version,
    },
  };
}

export function validateVersionState(state) {
  const expectedVersion = state.versions.packageJson;
  const errors = [];
  const checks = [];

  if (typeof expectedVersion !== "string") {
    errors.push(`${VERSION_FILES.packageJson} must define a string version`);
  } else if (!SEMVER_PATTERN.test(expectedVersion)) {
    errors.push(`${VERSION_FILES.packageJson} version "${expectedVersion}" is not valid SemVer`);
  }

  for (const [key, actual] of Object.entries(state.versions)) {
    const file = versionFileForKey(key);
    const pass = actual === expectedVersion;
    checks.push({ file, value: actual ?? null, expected: expectedVersion ?? null, pass });
    if (!pass) {
      errors.push(`${file} version is "${actual ?? "<missing>"}"; expected "${expectedVersion ?? "<missing>"}"`);
    }
  }

  if (!hasChangelogEntry(state.changelog, expectedVersion)) {
    checks.push({
      file: VERSION_FILES.changelog,
      value: null,
      expected: `## [${expectedVersion}]`,
      pass: false,
    });
    errors.push(`${VERSION_FILES.changelog} is missing an entry for ${expectedVersion}`);
  } else {
    checks.push({
      file: VERSION_FILES.changelog,
      value: `## [${expectedVersion}]`,
      expected: `## [${expectedVersion}]`,
      pass: true,
    });
  }

  return {
    version: expectedVersion ?? null,
    ok: errors.length === 0,
    checks,
    errors,
  };
}

export function writeVersionState(root, version, { date = currentLocalDate(), skipChangelog = false } = {}) {
  assertValidVersion(version);

  const state = readVersionState(root);
  state.packageJson.version = version;
  state.packageLock.version = version;
  state.packageLock.packages ??= {};
  state.packageLock.packages[""] ??= {};
  state.packageLock.packages[""].version = version;
  state.tauriConfig.version = version;

  writeJson(root, VERSION_FILES.packageJson, state.packageJson);
  writeJson(root, VERSION_FILES.packageLock, state.packageLock);
  writeText(root, VERSION_FILES.cargoToml, writeCargoPackageVersion(state.cargoToml, version));
  writeJson(root, VERSION_FILES.tauriConfig, state.tauriConfig);

  if (!skipChangelog) {
    writeText(root, VERSION_FILES.changelog, ensureChangelogEntry(state.changelog, version, date));
  }
}

export function hasChangelogEntry(content, version) {
  if (!version) {
    return false;
  }
  return new RegExp(`^## \\[${escapeRegExp(version)}\\](?:\\s|$)`, "m").test(content);
}

export function ensureChangelogEntry(content, version, date = currentLocalDate()) {
  assertValidVersion(version);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Expected --date to use YYYY-MM-DD, got "${date}"`);
  }
  if (hasChangelogEntry(content, version)) {
    return content.endsWith("\n") ? content : `${content}\n`;
  }

  const entry = `## [${version}] - ${date}\n\n- Prepared version ${version}.\n`;
  const base =
    content.trim().length > 0
      ? content.trimEnd()
      : "# Changelog\n\nAll notable changes to this project are tracked here.\nThis project uses SemVer for app version metadata.";
  const firstReleaseHeading = base.search(/^## /m);

  if (firstReleaseHeading === -1) {
    return `${base}\n\n${entry}`;
  }

  return `${base.slice(0, firstReleaseHeading).trimEnd()}\n\n${entry}\n${base.slice(firstReleaseHeading).trimStart()}\n`;
}

export function readCargoPackageVersion(content) {
  const lines = content.split("\n");
  let inPackage = false;
  for (const line of lines) {
    const section = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (section) {
      inPackage = section[1] === "package";
      continue;
    }
    if (!inPackage) {
      continue;
    }
    const version = line.match(/^\s*version\s*=\s*"([^"]+)"\s*$/);
    if (version) {
      return version[1];
    }
  }
  return undefined;
}

export function writeCargoPackageVersion(content, version) {
  const lines = content.split("\n");
  let inPackage = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const section = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (section) {
      if (inPackage) {
        break;
      }
      inPackage = section[1] === "package";
      continue;
    }
    if (inPackage && /^\s*version\s*=\s*"[^"]+"\s*$/.test(line)) {
      lines[index] = line.replace(/"[^"]+"/, `"${version}"`);
      return lines.join("\n");
    }
  }
  throw new Error(`${VERSION_FILES.cargoToml} is missing [package] version`);
}

export function currentLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readJson(root, relativePath) {
  return JSON.parse(readText(root, relativePath));
}

function writeJson(root, relativePath, value) {
  writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readText(root, relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function writeText(root, relativePath, value) {
  writeFileSync(join(root, relativePath), value);
}

function versionFileForKey(key) {
  return (
    {
      packageJson: VERSION_FILES.packageJson,
      packageLock: VERSION_FILES.packageLock,
      packageLockRoot: `${VERSION_FILES.packageLock} packages[""]`,
      cargoToml: VERSION_FILES.cargoToml,
      tauriConfig: VERSION_FILES.tauriConfig,
    }[key] ?? key
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
