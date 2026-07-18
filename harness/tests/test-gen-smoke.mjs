import assert from "node:assert/strict";
import { createGame } from "../../src/engine.js";
import { loadConfig } from "../config.mjs";
import { runGame } from "../run.mjs";

// Fake engine LLM: lore JSON then place JSON (no live API).
let llmCalls = 0;
const fakeLlmClient = {
  transport: "fake",
  async complete({ system }) {
    llmCalls++;
    const isPlace =
      /dirBack|"id".*"name".*"desc"|expanding the map|Propose ONE new place/i.test(
        system
      );
    if (isPlace) {
      return {
        content: JSON.stringify({
          id: "smoke_ridge",
          name: "Smoke Ridge",
          desc: "A warm palm ridge above the beach.",
          dirBack: "south",
        }),
        status: "ok",
        transport: "fake",
      };
    }
    return {
      content: JSON.stringify({
        answer: "Crabs live among the tide pools and feed at dusk.",
        facts: ["Tide pools hold edible crabs."],
        entities: [],
      }),
      status: "ok",
      transport: "fake",
    };
  },
};

let turn = 0;
async function scriptedDecideAction() {
  turn++;
  if (turn === 1) {
    return {
      action: "ask",
      target: null,
      item: null,
      say: "What lives in the pools?",
      parsedOk: true,
      promptVersion: "smoke",
    };
  }
  if (turn === 2) {
    return {
      action: "discover",
      target: "ridge inland",
      item: null,
      say: null,
      parsedOk: true,
      promptVersion: "smoke",
    };
  }
  return { action: "wait", parsedOk: true, promptVersion: "smoke" };
}

const config = loadConfig({
  env: {},
  overrides: {
    MAX_TURNS: 3,
    MAX_GEN_PER_RUN: 10,
    RECORD_DIR: "harness/runs",
  },
});

const run = await runGame({
  arm: "full",
  observeMode: "privileged",
  config,
  decideAction: scriptedDecideAction,
  llmClient: fakeLlmClient,
});

const gens = run.trajectory.filter((s) => s && s.kind === "gen");
assert.ok(
  gens.some((g) => g.type === "lore" && g.verdict === "accepted"),
  "expected accepted lore gen"
);
assert.ok(
  gens.some((g) => g.type === "place" && g.verdict === "accepted"),
  "expected accepted place gen"
);
assert.ok(run.genCalls >= 2);
assert.ok(Array.isArray(run.harvest));
assert.ok(run.harvest.length >= 0);
assert.ok(llmCalls >= 2, "fake llm should have been called");

// Also exercise createGame dumpHarvest directly (Agent API).
const mem = new Map();
const storage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
let directCalls = 0;
const game = createGame({
  storage,
  arm: "full",
  llm: async (system) => {
    directCalls++;
    if (/Propose ONE new place|dirBack/i.test(system)) {
      return JSON.stringify({
        id: "direct_cove",
        name: "Direct Cove",
        desc: "A narrow mangrove cove.",
        dirBack: "north",
      });
    }
    return JSON.stringify({
      answer: "The reef shelters small fish.",
      facts: [],
      entities: [],
    });
  },
});
game.reset({ fresh: true });
const ask = game.act({ action: "ask", say: "Tell me about the reef." });
assert.equal(ask.pendingGen?.type, "lore");
const loreGen = await game.genStep(ask.pendingGen);
assert.equal(loreGen.type, "lore");
const disc = game.act({ action: "discover", target: "mangrove" });
assert.equal(disc.pendingGen?.type, "place");
const placeGen = await game.genStep(disc.pendingGen);
assert.equal(placeGen.type, "place");
const harvest = game.dumpHarvest();
assert.ok(harvest.length >= 0);
assert.ok(directCalls >= 2);

console.log("test-gen-smoke: ok", {
  ending: run.ending,
  genCalls: run.genCalls,
  harvestLen: run.harvest.length,
  dumpHarvestLen: harvest.length,
});
