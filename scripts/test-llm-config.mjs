// Unit tests for scripts/lib/llm-config.mjs
// Run: node scripts/test-llm-config.mjs

import { rmSync, existsSync } from "node:fs";
import {
  listApiKeyEnvNames,
  validateLlmConfig,
  normalizeLlmConfig,
  resolveLlmConfig,
  readLlmConfig,
  writeLlmConfig,
  DEFAULT_ENDPOINT_URL,
  DEFAULT_MODEL,
  DEFAULT_API_KEY_ENV,
  LOCAL_LLM_CONFIG_FILE,
} from "./lib/llm-config.mjs";

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name); }
}

{
  const names = listApiKeyEnvNames({
    OPENROUTER_API_KEY: "a",
    TOKENROUTER_API_KEY: "b",
    EMPTY_API_KEY: "",
    NOT_A_KEY: "x",
    UPSTASH_REDIS_REST_TOKEN: "t",
  });
  ok(names.includes("OPENROUTER_API_KEY") && names.includes("TOKENROUTER_API_KEY"), "discover *_API_KEY names");
  ok(!names.includes("EMPTY_API_KEY") && !names.includes("NOT_A_KEY"), "skip empty / non-matching");
}

{
  const env = { OPENROUTER_API_KEY: "k", TOKENROUTER_API_KEY: "t" };
  ok(validateLlmConfig({
    endpointUrl: "https://api.tokenrouter.com/v1/chat/completions",
    apiKeyEnv: "TOKENROUTER_API_KEY",
    model: "gpt-5.5",
  }, env) === null, "valid config passes");
  ok(validateLlmConfig({ endpointUrl: "ftp://x", apiKeyEnv: "OPENROUTER_API_KEY", model: "m" }, env), "reject non-http(s)");
  ok(validateLlmConfig({ endpointUrl: "https://x", apiKeyEnv: "MISSING_API_KEY", model: "m" }, env), "reject missing env");
  ok(validateLlmConfig({ endpointUrl: "https://x", apiKeyEnv: "bad", model: "m" }, env), "reject bad env name");
  ok(validateLlmConfig({ endpointUrl: "https://x", apiKeyEnv: "OPENROUTER_API_KEY", model: "" }, env), "reject empty model");
}

{
  const r = resolveLlmConfig(null, { OPENROUTER_API_KEY: "k" });
  ok(r.endpointUrl === DEFAULT_ENDPOINT_URL, "default endpoint");
  ok(r.apiKeyEnv === DEFAULT_API_KEY_ENV, "default apiKeyEnv");
  ok(r.model === DEFAULT_MODEL, "default model");
  ok(r.apiKey === "k", "default key from env");
}

{
  const r = resolveLlmConfig(null, {
    OPENROUTER_API_KEY: "k",
    YORK_LLM_MODEL: "env-model",
  });
  ok(r.model === "env-model", "YORK_LLM_MODEL fallback when no store");
}

{
  const r = resolveLlmConfig({
    endpointUrl: "https://tokenrouter.me/v1/chat/completions",
    apiKeyEnv: "TOKENROUTER_API_KEY",
    model: "stored-model",
  }, {
    TOKENROUTER_API_KEY: "tr",
    YORK_LLM_MODEL: "ignored",
  });
  ok(r.endpointUrl.includes("tokenrouter"), "stored endpoint wins");
  ok(r.apiKey === "tr" && r.model === "stored-model", "stored key+model win over env model");
}

{
  if (existsSync(LOCAL_LLM_CONFIG_FILE)) rmSync(LOCAL_LLM_CONFIG_FILE);
  const cfg = normalizeLlmConfig({
    endpointUrl: "https://example.com/v1/chat/completions",
    apiKeyEnv: "OPENROUTER_API_KEY",
    model: "file-model",
  });
  const w = await writeLlmConfig(false, cfg, { vercel: false });
  ok(w.store === "file", "write local file store");
  const read = await readLlmConfig(false);
  ok(read && read.model === "file-model", "read local file store");
  if (existsSync(LOCAL_LLM_CONFIG_FILE)) rmSync(LOCAL_LLM_CONFIG_FILE);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
