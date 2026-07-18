import assert from "node:assert/strict";
import { loadConfig } from "../config.mjs";
import { runGame } from "../run.mjs";
import { decideOffline } from "../player-offline.mjs";

const config = loadConfig({
  env: {},
  overrides: { MAX_TURNS: 50, RECORD_DIR: "harness/runs" },
});
const run = await runGame({
  arm: "spine",
  observeMode: "privileged",
  config,
  decideAction: decideOffline,
});
assert.ok(run.ending === "turn_cap" || run.ending === "perish" || run.ending);
assert.equal(run.genCalls, 0);
assert.ok(run.genSkipped >= 0);
assert.ok(Array.isArray(run.trajectory));
console.log("test-run-spine: ok", run.ending, run.turns);
