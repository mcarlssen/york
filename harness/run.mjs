import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createGame } from "../src/engine.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function resolveRecordDir(recordDir) {
  if (!recordDir) return join(REPO_ROOT, "harness/runs");
  return isAbsolute(recordDir) ? recordDir : join(REPO_ROOT, recordDir);
}

function persistRun(recordDir, run) {
  mkdirSync(recordDir, { recursive: true });
  const runPath = join(recordDir, `${run.id}.json`);
  writeFileSync(runPath, JSON.stringify(run, null, 2));

  const manifestPath = join(recordDir, "manifest.json");
  let manifest = { runs: [] };
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (!Array.isArray(manifest.runs)) manifest.runs = [];
    } catch {
      manifest = { runs: [] };
    }
  }
  manifest.runs.push({
    id: run.id,
    arm: run.arm,
    observeMode: run.observeMode,
    ending: run.ending,
    turns: run.turns,
    startedAt: run.startedAt,
    path: `${run.id}.json`,
  });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return runPath;
}

export async function runGame({
  arm,
  observeMode,
  config,
  decideAction,
  llmClient = null,
}) {
  const engineLlm = llmClient
    ? async (system, user, maxTokens) => {
        const r = await llmClient.complete({ system, user, maxTokens });
        return r.content;
      }
    : null;
  const game = createGame({ arm, llm: engineLlm });
  game.reset({ fresh: true });
  const trajectory = [];
  const failures = {
    parse_fail: 0,
    rate_limit: 0,
    transport_fail: 0,
    empty: 0,
    engine_reject: 0,
  };
  let genCalls = 0;
  let genRejections = 0;
  let genSkipped = 0;
  let ending = null;
  let promptVersion = "offline";
  const startedAt = new Date().toISOString();
  const id = `${Date.now()}-${arm}-${Math.random().toString(36).slice(2, 8)}`;

  for (let turns = 0; turns < config.MAX_TURNS; turns++) {
    if (game.isOver()) break;
    const obs = game.observe(observeMode);
    const decision = await decideAction(obs, trajectory);
    if (decision.promptVersion) promptVersion = decision.promptVersion;
    if (decision.failure === "parse_fail") failures.parse_fail++;
    if (decision.failure === "rate_limit") failures.rate_limit++;
    if (decision.failure === "transport_fail") failures.transport_fail++;
    if (decision.failure === "empty") failures.empty++;
    if (decision.abort === "rate_limit") {
      ending = "rate_limit_abort";
      break;
    }
    const action = {
      action: decision.action,
      target: decision.target ?? null,
      item: decision.item ?? null,
      say: decision.say ?? null,
    };
    const result = game.act(action);
    if (!result.ok) failures.engine_reject++;
    trajectory.push({
      kind: "act",
      obs,
      action,
      result,
      raw: decision.raw,
      parsedOk: decision.parsedOk !== false,
    });

    if (result.pendingGen) {
      if (arm === "spine" || genCalls >= config.MAX_GEN_PER_RUN) {
        const g = await game.genStep(result.pendingGen);
        genSkipped++;
        trajectory.push(g);
      } else {
        const g = await game.genStep(result.pendingGen);
        genCalls++;
        if (g.verdict === "rejected" || g.verdict === "unavailable") genRejections++;
        trajectory.push(g);
      }
    }
  }
  if (!ending) {
    ending = game.isOver() ? game.ending() : "turn_cap";
  }
  const run = {
    id,
    arm,
    observeMode,
    promptVersion,
    model: config.PLAYER_MODEL,
    transport: llmClient?.transport ?? "none",
    startedAt,
    ending,
    metrics: game.metrics(),
    turns: trajectory.filter((s) => s.kind === "act").length,
    trajectory,
    loreStats: game.loreStats(),
    failures,
    genCalls,
    genRejections,
    genSkipped,
    harvestRef: null,
    selfReport: null,
  };
  persistRun(resolveRecordDir(config.RECORD_DIR), run);
  return run;
}
