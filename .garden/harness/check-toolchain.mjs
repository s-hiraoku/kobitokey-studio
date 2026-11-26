// ガーデンの対象固有のハーネス: AC-001（Node 24 ツールチェーンと npm 依存の準備）
// 終了コード: 0 = 準備完了, 75 = 環境不備（INCONCLUSIVE）
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const evidenceDir = process.env.GARDEN_EVIDENCE_DIR ?? ".";

function writeEvidence(payload) {
  writeFileSync(
    join(evidenceDir, "toolchain-diagnostic.json"),
    JSON.stringify(payload, null, 2) + "\n",
    "utf8",
  );
}

function readRequiredNodeMajor() {
  try {
    return readFileSync(".node-version", "utf8").trim().split(".")[0];
  } catch {
    return "24";
  }
}

function npmVersion() {
  try {
    return execFileSync("npm", ["--version"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const requiredMajor = readRequiredNodeMajor();
const actualNode = process.versions.node;
const actualMajor = actualNode.split(".")[0];
const actualNpm = npmVersion();

if (actualMajor !== requiredMajor) {
  const diagnostic = {
    ready: false,
    reason: "node_version_mismatch",
    required: { node_major: requiredMajor },
    actual: { node: actualNode, npm: actualNpm },
    remedy: `Install Node.js ${requiredMajor}.x (see .node-version).`,
  };
  writeEvidence(diagnostic);
  console.error(
    `node_version_mismatch: required Node ${requiredMajor}.x, actual ${actualNode}`,
  );
  process.exit(75);
}

if (!actualNpm) {
  const diagnostic = {
    ready: false,
    reason: "npm_missing",
    required: { node_major: requiredMajor },
    actual: { node: actualNode, npm: null },
    remedy: "Ensure npm is available on PATH.",
  };
  writeEvidence(diagnostic);
  console.error("npm_missing: npm executable not found on PATH");
  process.exit(75);
}

if (!existsSync("node_modules")) {
  const res = spawnSync("npm", ["ci", "--no-audit", "--no-fund"], {
    stdio: "inherit",
  });
  const code = res.error ? 127 : res.status ?? 1;
  if (code !== 0) {
    const diagnostic = {
      ready: false,
      reason: "dependency_install_failed",
      exit_code: code,
      required: { node_major: requiredMajor },
      actual: { node: actualNode, npm: actualNpm },
      remedy: "Check network access to the npm registry and package-lock.json.",
    };
    writeEvidence(diagnostic);
    console.error(`dependency_install_failed: npm ci exited with ${code}`);
    process.exit(75);
  }
}

writeEvidence({
  ready: true,
  required: { node_major: requiredMajor },
  actual: { node: actualNode, npm: actualNpm },
});
console.log(`toolchain ready (node ${actualNode}, npm ${actualNpm})`);
