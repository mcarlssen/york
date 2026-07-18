// Shared LLM router config — Redis (or local file) + env key resolution.
// Used by api/lore.js and harness. Never stores or returns API key values.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const LLM_CONFIG_KEY = "york:llm-config";
export const LOCAL_LLM_CONFIG_FILE = join(__dirname, "..", "..", ".cache", "llm-config.json");

export const DEFAULT_ENDPOINT_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
export const DEFAULT_API_KEY_ENV = "OPENROUTER_API_KEY";

const API_KEY_ENV_RE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*_API_KEY$/;

export function listApiKeyEnvNames(env = process.env) {
  return Object.keys(env)
    .filter((k) => /_API_KEY$/.test(k) && env[k])
    .sort();
}

export function validateLlmConfig(body, env = process.env) {
  if (!body || typeof body !== "object") return "body required";
  const endpointUrl = body.endpointUrl;
  const apiKeyEnv = body.apiKeyEnv;
  const model = body.model;
  if (typeof endpointUrl !== "string" || !endpointUrl.trim()) return "endpointUrl required";
  try {
    const u = new URL(endpointUrl.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return "endpointUrl must be http(s)";
  } catch {
    return "endpointUrl invalid";
  }
  if (typeof apiKeyEnv !== "string" || !API_KEY_ENV_RE.test(apiKeyEnv)) {
    return "apiKeyEnv must look like FOO_API_KEY";
  }
  if (!env[apiKeyEnv]) return `env ${apiKeyEnv} is not set`;
  if (typeof model !== "string" || !model.trim()) return "model required";
  if (model.trim().length > 200) return "model too long (max 200)";
  return null;
}

export function normalizeLlmConfig(body) {
  return {
    endpointUrl: String(body.endpointUrl).trim(),
    apiKeyEnv: String(body.apiKeyEnv).trim(),
    model: String(body.model).trim(),
  };
}

/** Resolve runtime LLM settings. `stored` is Redis/file payload or null. */
export function resolveLlmConfig(stored, env = process.env) {
  const endpointUrl = (stored && stored.endpointUrl) || DEFAULT_ENDPOINT_URL;
  const apiKeyEnv = (stored && stored.apiKeyEnv) || DEFAULT_API_KEY_ENV;
  const model =
    (stored && stored.model) ||
    env.YORK_LLM_MODEL ||
    env.LORE_VALIDATOR_MODEL ||
    DEFAULT_MODEL;
  const apiKey = env[apiKeyEnv] || undefined;
  return { endpointUrl, apiKeyEnv, model, apiKey };
}

function coerceStored(v) {
  if (!v) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (typeof v === "object") return v;
  return null;
}

/** @param {false|null|import("@upstash/redis").Redis} redis */
export async function readLlmConfig(redis) {
  if (redis) {
    return coerceStored(await redis.get(LLM_CONFIG_KEY));
  }
  if (existsSync(LOCAL_LLM_CONFIG_FILE)) {
    try {
      return JSON.parse(readFileSync(LOCAL_LLM_CONFIG_FILE, "utf8"));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * @param {false|null|import("@upstash/redis").Redis} redis
 * @param {{ endpointUrl: string, apiKeyEnv: string, model: string }} config
 * @param {{ vercel?: boolean }} [opts]
 */
export async function writeLlmConfig(redis, config, opts = {}) {
  if (redis) {
    await redis.set(LLM_CONFIG_KEY, config);
    return { store: "redis" };
  }
  if (opts.vercel || process.env.VERCEL) {
    const err = new Error("no_durable_store");
    err.code = "no_durable_store";
    throw err;
  }
  mkdirSync(dirname(LOCAL_LLM_CONFIG_FILE), { recursive: true });
  writeFileSync(LOCAL_LLM_CONFIG_FILE, JSON.stringify(config, null, 2));
  return { store: "file" };
}

export function publicLlmConfigPayload(stored, env = process.env, store = "empty") {
  const resolved = resolveLlmConfig(stored, env);
  return {
    config: {
      endpointUrl: resolved.endpointUrl,
      apiKeyEnv: resolved.apiKeyEnv,
      model: resolved.model,
    },
    apiKeyEnvs: listApiKeyEnvNames(env),
    store,
  };
}
