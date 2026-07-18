import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULTS = {
  OPENROUTER_API_KEY: undefined,
  API_BASE: null,
  PLAYER_MODEL: "nvidia/nemotron-3-ultra-550b-a55b:free",
  CRITIC_MODEL: "nvidia/nemotron-3-ultra-550b-a55b:free",
  RUNS_SPINE: 10,
  RUNS_FULL: 20,
  RUNS_BLIND: 5,
  MAX_TURNS: 200,
  MAX_TOKENS_PER_LOOP: 2_000_000,
  MAX_GEN_PER_RUN: 40,
  TEMPERATURE: 0.7,
  RECORD_DIR: "harness/runs",
  REPORT_DIR: "harness/reports",
  HARVEST_DIR: "harness/harvest",
  LEARNABILITY_PASS: false,
  CRITIC_ENABLED: false,
};

const NUMERIC_KEYS = new Set([
  "RUNS_SPINE",
  "RUNS_FULL",
  "RUNS_BLIND",
  "MAX_TURNS",
  "MAX_TOKENS_PER_LOOP",
  "MAX_GEN_PER_RUN",
  "TEMPERATURE",
]);

const BOOLEAN_KEYS = new Set(["LEARNABILITY_PASS", "CRITIC_ENABLED"]);

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  return [key, val];
}

function parseEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (parsed) out[parsed[0]] = parsed[1];
  }
  return out;
}

function coerceValue(key, raw) {
  if (raw === undefined || raw === null || raw === "") {
    if (key === "API_BASE") return null;
    return undefined;
  }
  if (BOOLEAN_KEYS.has(key)) {
    const lower = String(raw).toLowerCase();
    if (lower === "true" || lower === "1") return true;
    if (lower === "false" || lower === "0") return false;
  }
  if (NUMERIC_KEYS.has(key)) {
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
  }
  if (key === "API_BASE" && (raw === "null" || raw === "undefined")) return null;
  return String(raw);
}

function mergeEnv(config, env) {
  for (const [key, raw] of Object.entries(env)) {
    if (raw === undefined) continue;
    const coerced = coerceValue(key, raw);
    if (coerced !== undefined) config[key] = coerced;
  }
}

export function loadConfig(opts = {}) {
  const config = { ...DEFAULTS };
  mergeEnv(config, parseEnvFile(join(REPO_ROOT, ".env")));
  mergeEnv(config, opts.env ?? process.env);
  if (opts.overrides) Object.assign(config, opts.overrides);
  return config;
}
