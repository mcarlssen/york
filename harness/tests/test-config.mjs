import assert from "node:assert/strict";
import { loadConfig } from "../config.mjs";

const c = loadConfig({ env: { OPENROUTER_API_KEY: "x" } });
assert.equal(c.PLAYER_MODEL, "nvidia/nemotron-3-ultra-550b-a55b:free");
assert.equal(c.RUNS_SPINE, 10);
assert.equal(c.MAX_GEN_PER_RUN, 40);
assert.equal(c.CRITIC_ENABLED, false);
console.log("test-config: ok");
