// ガーデンの対象固有のハーネス: AC-002 / AC-003 / INV-001
// 終了コード: 0 = 全段階合格, 1 = 挙動不一致（UNSATISFIED）, 75 = 環境不備（INCONCLUSIVE）
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const evidenceDir = process.env.GARDEN_EVIDENCE_DIR ?? ".";

function writeEvidence(payload) {
  writeFileSync(
    join(evidenceDir, "frontend-verify-result.json"),
    JSON.stringify(payload, null, 2) + "\n",
    "utf8",
  );
}

if (!existsSync("node_modules")) {
  writeEvidence({
    passed: false,
    reason: "node_modules_missing",
    stages: [],
  });
  console.error("node_modules_missing: run check-toolchain.mjs first");
  process.exit(75);
}

const stages = [
  { id: "check_version", cmd: "npm", args: ["run", "check:version"] },
  {
    id: "check_version_self_test",
    cmd: "npm",
    args: ["run", "check:version-self-test"],
  },
  { id: "lint", cmd: "npm", args: ["run", "lint"] },
  { id: "unit_test", cmd: "npm", args: ["test"] },
  { id: "build", cmd: "npm", args: ["run", "build"] },
];

const results = [];
let failedStage = null;

for (const stage of stages) {
  const started = Date.now();
  const res = spawnSync(stage.cmd, stage.args, { stdio: "inherit" });
  const durationMs = Date.now() - started;
  const exitCode = res.error ? 127 : res.status ?? 1;
  results.push({
    id: stage.id,
    command: [stage.cmd, ...stage.args],
    exit_code: exitCode,
    passed: exitCode === 0,
    duration_ms: durationMs,
  });
  if (exitCode !== 0) {
    failedStage = stage.id;
    break;
  }
}

writeEvidence({
  passed: failedStage === null,
  failed_stage: failedStage,
  stages: results,
});

if (failedStage !== null) {
  console.error(`frontend verification failed at stage: ${failedStage}`);
  process.exit(1);
}

console.log(`frontend verification passed (${results.length} stages)`);
