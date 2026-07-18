import { readdirSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadConfigWithLlmStore } from "./config.mjs";
import { createLlmClient } from "./llm.mjs";
import { createDecideAction } from "./player.mjs";
import { decideOffline } from "./player-offline.mjs";
import { runGame } from "./run.mjs";
import { analyze } from "./analyze.mjs";
import { writeHarvest } from "./harvest.mjs";
import { runCritic } from "./critic.mjs";
import { writeReport } from "./report.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES_DIR = join(REPO_ROOT, "harness/fixtures");

function resolveDir(dir, fallback) {
  if (!dir) return join(REPO_ROOT, fallback);
  return isAbsolute(dir) ? dir : join(REPO_ROOT, dir);
}

function baselineMode(config) {
  return (
    process.env.BASELINE ||
    config.BASELINE ||
    "llm"
  ).toLowerCase();
}

function tokensUsed(client) {
  if (!client) return 0;
  if (typeof client.tokensUsed === "function") return client.tokensUsed();
  if (typeof client.tokensUsed === "number") return client.tokensUsed;
  if (typeof client.usage?.totalTokens === "number") {
    return client.usage.totalTokens;
  }
  if (typeof client.usage?.total_tokens === "number") {
    return client.usage.total_tokens;
  }
  return 0;
}

function budgetExceeded(config, client) {
  const used = tokensUsed(client);
  if (!used) return false;
  return used >= (config.MAX_TOKENS_PER_LOOP ?? Infinity);
}

function replayAllFixtures() {
  const files = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (!files.length) {
    console.error("no fixtures in harness/fixtures/");
    process.exit(1);
  }
  for (const f of files) {
    const path = join(FIXTURES_DIR, f);
    const r = spawnSync(
      process.execPath,
      [join(REPO_ROOT, "harness/replay.mjs"), path],
      { stdio: "inherit", cwd: REPO_ROOT }
    );
    if (r.status !== 0) {
      console.error(`fixture replay failed: ${f}`);
      process.exit(1);
    }
  }
}

function requireKeyUnlessOffline(config, baseline) {
  if (baseline === "offline") return;
  if (config.API_BASE) return;
  if (config.OPENROUTER_API_KEY) return;
  console.error(
    "API key required for llm baseline (set a *_API_KEY / OPENROUTER_API_KEY, or BASELINE=offline / API_BASE)."
  );
  process.exit(1);
}

function makeDecide(arm, observeMode, baseline, config, llmClient) {
  if (baseline === "offline") {
    return { decideAction: decideOffline, llmClient: null };
  }
  const client = llmClient || createLlmClient(config);
  return {
    decideAction: createDecideAction(client, {
      ...config,
      arm,
      observeMode,
    }),
    llmClient: client,
  };
}

function shortSummary(label, data) {
  if (!data) return `${label}: n/a`;
  if (data.summary) return String(data.summary);
  const arms = data.byArm ? Object.keys(data.byArm) : [];
  return `${label}: arms=[${arms.join(",") || "none"}]`;
}

export async function main() {
  const config = await loadConfigWithLlmStore();
  const baseline = baselineMode(config);

  console.log("replaying fixtures…");
  replayAllFixtures();

  const runs = [];
  let llmClient = null;
  if (baseline !== "offline") {
    requireKeyUnlessOffline(config, baseline);
    llmClient = createLlmClient(config);
  }

  const schedule = [
    ...Array.from({ length: config.RUNS_SPINE }, () => ({
      arm: "spine",
      observeMode: "privileged",
    })),
    ...Array.from({ length: config.RUNS_FULL }, () => ({
      arm: "full",
      observeMode: "privileged",
    })),
    ...Array.from({ length: config.RUNS_BLIND }, () => ({
      arm: "blind",
      observeMode: "blind",
    })),
  ];

  for (const job of schedule) {
    if (budgetExceeded(config, llmClient)) {
      console.warn("MAX_TOKENS_PER_LOOP exceeded; stopping new runs");
      break;
    }
    // spine defaults offline unless BASELINE=llm; full/blind need llm unless offline
    const armBaseline =
      baseline === "offline"
        ? "offline"
        : job.arm === "spine"
          ? baseline === "llm"
            ? "llm"
            : "offline"
          : "llm";

    if (armBaseline === "llm") {
      requireKeyUnlessOffline(config, "llm");
      if (!llmClient) llmClient = createLlmClient(config);
    }

    const { decideAction, llmClient: client } = makeDecide(
      job.arm,
      job.observeMode,
      armBaseline,
      config,
      llmClient
    );
    if (client) llmClient = client;

    console.log(`run ${job.arm}/${job.observeMode}…`);
    const run = await runGame({
      arm: job.arm,
      observeMode: job.observeMode,
      config,
      decideAction,
      llmClient: armBaseline === "offline" ? null : llmClient,
    });
    runs.push(run);
  }

  const signals = analyze(runs);
  const batchId = `batch-${Date.now()}`;
  const harvestPath = writeHarvest(batchId, runs, config);
  signals.world = {
    ...signals.world,
    harvestPath,
    summary: shortSummary("world", signals.world),
  };
  signals.mechanics = {
    ...signals.mechanics,
    summary: shortSummary("mechanics", signals.mechanics),
  };
  signals.loop = {
    ...signals.loop,
    summary: shortSummary("loop", signals.loop),
  };

  let proxyNotes = null;
  if (config.CRITIC_ENABLED) {
    proxyNotes = await runCritic({
      runs,
      signals,
      config,
      llmClient: baseline === "offline" ? null : llmClient,
    });
  }

  const reportRoot = resolveDir(config.REPORT_DIR, "harness/reports");
  const outDir = join(reportRoot, String(Date.now()));
  mkdirSync(outDir, { recursive: true });

  const promptVersion =
    runs.find((r) => r.promptVersion)?.promptVersion || "offline";
  const manifest = {
    promptVersion,
    batchId,
    baseline,
    runCount: runs.length,
    runs: runs.map((r) => ({
      id: r.id,
      arm: r.arm,
      observeMode: r.observeMode,
      ending: r.ending,
      turns: r.turns,
    })),
  };

  const { reportPath } = writeReport({
    outDir,
    signals,
    manifest,
    proxyNotes,
  });

  console.log(reportPath);
  return { reportPath, runs, signals, harvestPath };
}

const isCli =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
