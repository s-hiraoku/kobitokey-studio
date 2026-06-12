import { resolve } from "node:path";
import { assertValidVersion, currentLocalDate, readVersionState, validateVersionState, writeVersionState } from "./version-files.mjs";

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  console.log(`Usage: node scripts/set-version.mjs <version> [--date YYYY-MM-DD] [--dry-run] [--skip-changelog] [--root DIR]

Updates package.json, package-lock.json, src-tauri/Cargo.toml,
src-tauri/tauri.conf.json, and CHANGELOG.md to the same SemVer version.`);
  process.exit(0);
}

try {
  assertValidVersion(options.version);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
    throw new Error(`Expected --date to use YYYY-MM-DD, got "${options.date}"`);
  }

  if (options.dryRun) {
    const before = validateVersionState(readVersionState(options.root));
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          from: before.version,
          to: options.version,
          changelog: options.skipChangelog ? "skipped" : "will ensure entry",
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  writeVersionState(options.root, options.version, {
    date: options.date,
    skipChangelog: options.skipChangelog,
  });

  const result = validateVersionState(readVersionState(options.root));
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(`set-version: ${error}`);
    }
    process.exit(1);
  }

  console.log(`OK updated version metadata to ${options.version}`);
} catch (error) {
  console.error(`set-version: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function parseArgs(args) {
  const options = {
    date: currentLocalDate(),
    dryRun: false,
    help: false,
    root: process.cwd(),
    skipChangelog: false,
    version: "",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--skip-changelog") {
      options.skipChangelog = true;
      continue;
    }
    if (arg === "--date") {
      const date = args[index + 1];
      if (!date) {
        throw new Error("--date requires YYYY-MM-DD");
      }
      options.date = date;
      index += 1;
      continue;
    }
    if (arg.startsWith("--date=")) {
      options.date = arg.slice("--date=".length);
      continue;
    }
    if (arg === "--root") {
      const root = args[index + 1];
      if (!root) {
        throw new Error("--root requires a directory");
      }
      options.root = resolve(root);
      index += 1;
      continue;
    }
    if (arg.startsWith("--root=")) {
      options.root = resolve(arg.slice("--root=".length));
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    if (options.version) {
      throw new Error(`Unexpected extra version argument: ${arg}`);
    }
    options.version = arg;
  }

  if (!options.help && !options.version) {
    throw new Error("Version is required. Run with --help for usage.");
  }

  return options;
}
