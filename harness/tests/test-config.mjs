import assert from "node:assert/strict";
import { loadConfig, applyLlmStore } from "../config.mjs";
import { DEFAULT_ENDPOINT_URL } from "../../scripts/lib/llm-config.mjs";

const c = loadConfig({ env: { OPENROUTER_API_KEY: "x" } });
assert.equal(c.PLAYER_MODEL, "nvidia/nemotron-3-ultra-550b-a55b:free");
assert.equal(c.RUNS_SPINE, 10);
assert.equal(c.MAX_GEN_PER_RUN, 40);
assert.equal(c.CRITIC_ENABLED, false);
assert.equal(c.LLM_ENDPOINT_URL, DEFAULT_ENDPOINT_URL);

await applyLlmStore(c, {
  redis: false,
  stored: {
    endpointUrl: "https://tokenrouter.me/v1/chat/completions",
    apiKeyEnv: "TOKENROUTER_API_KEY",
    model: "stored/model",
  },
  env: { TOKENROUTER_API_KEY: "tr-key", OPENROUTER_API_KEY: "or-key" },
});
assert.equal(c.LLM_ENDPOINT_URL, "https://tokenrouter.me/v1/chat/completions");
assert.equal(c.LLM_API_KEY_ENV, "TOKENROUTER_API_KEY");
assert.equal(c.PLAYER_MODEL, "stored/model");
assert.equal(c.OPENROUTER_API_KEY, "tr-key");

console.log("test-config: ok");
