import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyze } from "../analyze.mjs";
import { writeHarvest } from "../harvest.mjs";

const signals = analyze([
  {
    arm: "spine",
    observeMode: "privileged",
    ending: "perish",
    trajectory: [
      {
        kind: "act",
        action: { action: "go" },
        result: { ok: false, text: "blocked" },
      },
    ],
    failures: {
      engine_reject: 1,
      parse_fail: 0,
      rate_limit: 0,
      transport_fail: 0,
      empty: 0,
    },
    genCalls: 0,
  },
  {
    arm: "spine",
    observeMode: "privileged",
    ending: "perish",
    trajectory: [],
    failures: {
      engine_reject: 0,
      parse_fail: 0,
      rate_limit: 0,
      transport_fail: 0,
      empty: 0,
    },
    genCalls: 0,
  },
  {
    arm: "full",
    observeMode: "privileged",
    ending: "raft_escape",
    trajectory: [
      {
        kind: "gen",
        type: "lore",
        verdict: "accepted",
        answer: "Crabs live in the pools.",
      },
      {
        kind: "gen",
        type: "place",
        verdict: "accepted",
        place: { id: "x", name: "X" },
      },
    ],
    failures: {
      engine_reject: 0,
      parse_fail: 0,
      rate_limit: 0,
      transport_fail: 0,
      empty: 0,
    },
    genCalls: 2,
    metrics: { clock: 10 },
    loreStats: { nodes: 5, generated: 2 },
  },
]);

assert.ok(signals.mechanics.rejectionHotlist);
assert.ok(signals.loop.byArm.full);
assert.ok(signals.world.placeAcceptRate !== undefined);
assert.notEqual(
  signals.loop.byArm.spine?.endingCounts,
  signals.loop.byArm.full?.endingCounts
);
assert.equal(signals.loop.byArm.spine.endingCounts.perish, 2);
assert.equal(signals.loop.byArm.full.endingCounts.raft_escape, 1);

const harvestDir = mkdtempSync(join(tmpdir(), "york-harvest-"));
const dupRun = {
  id: "dup-a",
  arm: "full",
  promptVersion: "smoke",
  model: "test",
  trajectory: [
    {
      kind: "gen",
      type: "lore",
      verdict: "accepted",
      answer: "Crabs live in the pools.",
    },
  ],
};
const dupRun2 = {
  id: "dup-b",
  arm: "full",
  promptVersion: "smoke",
  model: "test",
  trajectory: [
    {
      kind: "gen",
      type: "lore",
      verdict: "accepted",
      answer: "  Crabs   live in the pools.  ",
    },
    {
      kind: "gen",
      type: "place",
      verdict: "accepted",
      place: { id: "x", name: "X", desc: "A place." },
    },
  ],
};
const path = writeHarvest("test-batch", [dupRun, dupRun2], {
  HARVEST_DIR: harvestDir,
});
const harvest = JSON.parse(readFileSync(path, "utf8"));
assert.equal(harvest.candidates.length, 2);
assert.ok(harvest.candidates.some((c) => c.kind === "fact"));
assert.ok(harvest.candidates.some((c) => c.kind === "place"));
rmSync(harvestDir, { recursive: true, force: true });

console.log("test-analyze: ok");
