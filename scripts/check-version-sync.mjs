import { resolve } from "node:path";
import { readVersionState, validateVersionState } from "./version-files.mjs";

const options = parseArgs(process.argv.slice(2));

try {
  const state = readVersionState(options.root);
  const result = validateVersionState(state);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log(`OK version ${result.version} is synchronized`);
  } else {
    for (const error of result.errors) {
      console.error(`version-sync: ${error}`);
    }
  }

  process.exit(result.ok ? 0 : 1);
} catch (error) {
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          errors: [error instanceof Error ? error.message : String(error)],
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`version-sync: ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exit(1);
}

function parseArgs(args) {
  const options = {
    json: false,
    root: process.cwd(),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
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
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}
