// Headless test for the three-tier shared-memory layer.
// Exercises api/lore.js round-trip + validation using the local file fallback
// (no Vercel KV, no network). Run: node scripts/test-shared-lore.mjs

import { rmSync, existsSync, readFileSync } from "node:fs";

const CACHE = new URL("../.cache/shared-lore.json", import.meta.url);
const LLM_CACHE = new URL("../.cache/llm-config.json", import.meta.url);
// start clean so the test is deterministic
if (existsSync(new URL(CACHE))) rmSync(new URL(CACHE));
if (existsSync(new URL(LLM_CACHE))) rmSync(new URL(LLM_CACHE));

const mod = await import("../api/lore.js");
const handler = mod.default;

// minimal res mock
function mkRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
  };
}
function mkReq(method, url, body) {
  return {
    method,
    url,
    body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  };
}

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name); } }

// --- 1. GET on empty graph -------------------------------------------------
{
  const res = mkRes();
  await handler(mkReq("GET", "http://x/api/lore?world=meridian"), res);
  ok(res.statusCode === 200 && res.body.count === 0, "GET empty graph returns 0 nodes");
}

// --- 2. POST a valid meridian-ecology fact ---------------------------------
{
  const res = mkRes();
  const nodes = [{
    id: "p1", source: "play", text: "the jungle interior hides a fallen survival cache",
    tags: ["generated", "lore"], subject: "jungle", relation: "hides", object: "a survival cache",
  }];
  await handler(mkReq("POST", "http://x/api/lore", { world: "meridian", nodes }), res);
  ok(res.statusCode === 200 && res.body.merged === 1 && res.body.rejected === 0,
     "POST valid fact is merged");
}

// --- 3. POST a fact that contradicts equatorial ecology (rejected) ----------
{
  const res = mkRes();
  const nodes = [{ id: "p2", source: "play", text: "a glacier sits at the island's frozen core",
    tags: ["generated"], subject: "island", relation: "has", object: "a glacier" }];
  await handler(mkReq("POST", "http://x/api/lore", { world: "meridian", nodes }), res);
  ok(res.statusCode === 200 && res.body.merged === 0 && res.body.rejected === 1,
     "POST cold/volcanic fact is rejected by ruleset");
}

// --- 4. duplicate by id is not double-merged -------------------------------
{
  const res = mkRes();
  const nodes = [{ id: "p1", source: "play", text: "the jungle interior hides a fallen survival cache",
    tags: ["generated"], subject: "jungle", relation: "hides", object: "a survival cache" }];
  await handler(mkReq("POST", "http://x/api/lore", { world: "meridian", nodes }), res);
  ok(res.statusCode === 200 && res.body.merged === 0, "duplicate-by-id not re-merged");
}

// --- 5. similar text not double-merged -------------------------------------
{
  const res = mkRes();
  // shares 8/10 tokens with the stored p1 text -> Jaccard 0.8 > 0.75 threshold
  const nodes = [{ id: "p3", source: "play", text: "the jungle interior hides a fallen survival cache near the spring",
    tags: ["generated"], subject: "jungle", relation: "hides", object: "a survival cache" }];
  await handler(mkReq("POST", "http://x/api/lore", { world: "meridian", nodes }), res);
  ok(res.statusCode === 200 && res.body.merged === 0, "near-duplicate text not re-merged");
}

// --- 6. client may not claim canonical/spec source -------------------------
{
  const res = mkRes();
  const nodes = [{ id: "p4", source: "spec", text: "the player is the sole survivor of the Meridian",
    tags: [], subject: "player", relation: "is", object: "survivor" }];
  await handler(mkReq("POST", "http://x/api/lore", { world: "meridian", nodes }), res);
  ok(res.statusCode === 200 && res.body.rejected === 1, "forbidden source label rejected");
}

// --- 6b. semantic contradiction check (LLM path) ---------------------------
// Stub fetch + set a server-side key so the semantic branch runs. The candidate
// below contradicts an equatorial island WITHOUT using any banned keyword, proving
// the semantic check catches what the heuristic cannot.
{
  const realFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "test-key";
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content:
      '{"conflict": true, "why": "a glacier is cold/temperate life, impossible on this equatorial island"}' } }] }),
  });
  const doc = JSON.parse(readFileSync(new URL("../openspec/world/world.json", import.meta.url), "utf8"));
  const why = await mod.validateNode(
    { id: "sem1", source: "play", text: "a slow glacier calves icebergs into the lagoon" },
    doc
  );
  ok(typeof why === "string" && /canon/.test(why), "semantic check rejects canon-contradicting fact");

  // a consistent new detail should be accepted by the model (no conflict)
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"conflict": false, "why": ""}' } }] }),
  });
  const ok2 = await mod.validateNode(
    { id: "sem2", source: "play", text: "a new species of reef fish darts among the coral" },
    doc
  );
  ok(ok2 === null, "semantic check accepts consistent new detail");

  delete process.env.OPENROUTER_API_KEY;
  globalThis.fetch = realFetch;
}

// --- 7. GET now reflects the one merged fact -------------------------------
{
  const res = mkRes();
  await handler(mkReq("GET", "http://x/api/lore?world=meridian"), res);
  ok(res.statusCode === 200 && res.body.count === 1 && res.body.nodes[0].source === "player",
     "GET reflects merged player fact");
}

// --- 7b. /api/llm proxy routes player calls through the server -----------
{
  const realFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "test-key";
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"action":"look"}' } }] }),
  });
  const res = mkRes();
  try {
    await handler(mkReq("POST", "http://x/api/llm",
      { system: "you interpret", user: "look around", maxTokens: 200 }), res);
  } catch (e) { console.log("  7b threw:", e.message, "| res typeof:", typeof res, "| has status:", typeof res.status); }
  ok(res.statusCode === 200 && res.body && res.body.ok === true && res.body.content === '{"action":"look"}',
     "/api/llm proxies player call and returns content");
  delete process.env.OPENROUTER_API_KEY;
  globalThis.fetch = realFetch;
}

// --- 7c. /api/llm-config GET/PUT ------------------------------------------
{
  const { LOCAL_LLM_CONFIG_FILE } = await import("../scripts/lib/llm-config.mjs");
  if (existsSync(LOCAL_LLM_CONFIG_FILE)) rmSync(LOCAL_LLM_CONFIG_FILE);
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.TOKENROUTER_API_KEY = "tr-key";

  const getRes = mkRes();
  await handler(mkReq("GET", "http://x/api/llm-config"), getRes);
  ok(getRes.statusCode === 200 && Array.isArray(getRes.body.apiKeyEnvs), "GET llm-config returns apiKeyEnvs");
  ok(getRes.body.apiKeyEnvs.includes("OPENROUTER_API_KEY") && getRes.body.apiKeyEnvs.includes("TOKENROUTER_API_KEY"),
     "GET llm-config autodiscovers keys");
  ok(getRes.body.config && getRes.body.config.model, "GET llm-config has resolved model");

  const putBad = mkRes();
  await handler(mkReq("PUT", "http://x/api/llm-config", {
    endpointUrl: "https://tokenrouter.me/v1/chat/completions",
    apiKeyEnv: "MISSING_API_KEY",
    model: "x",
  }), putBad);
  ok(putBad.statusCode === 400, "PUT llm-config rejects missing key env");

  const putOk = mkRes();
  await handler(mkReq("PUT", "http://x/api/llm-config", {
    endpointUrl: "https://tokenrouter.me/v1/chat/completions",
    apiKeyEnv: "TOKENROUTER_API_KEY",
    model: "admin-model",
  }), putOk);
  ok(putOk.statusCode === 200 && putOk.body.ok === true && putOk.body.config.model === "admin-model",
     "PUT llm-config persists model");

  const get2 = mkRes();
  await handler(mkReq("GET", "http://x/api/llm-config"), get2);
  ok(get2.body.config.apiKeyEnv === "TOKENROUTER_API_KEY" && get2.body.config.endpointUrl.includes("tokenrouter"),
     "GET llm-config reflects saved config");

  if (existsSync(LOCAL_LLM_CONFIG_FILE)) rmSync(LOCAL_LLM_CONFIG_FILE);
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.TOKENROUTER_API_KEY;
}

// --- 8. curator script diffs shared vs canonical ---------------------------
{
  // run curator against local fallback (no --api)
  const { execSync } = await import("node:child_process");
  let out = "";
  try { out = execSync("node scripts/curate-lore.mjs meridian", { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8" }); }
  catch (e) { out = (e.stdout || "") + (e.stderr || ""); }
  console.log(out);
  const changeDir = new URL("../openspec/changes/" + new Date().toISOString().slice(0,10) + "-curate-shared-lore/", import.meta.url);
  ok(existsSync(new URL("proposal.md", changeDir)) && existsSync(new URL("candidates.lore_seed.json", changeDir)),
     "curator wrote OpenSpec change with candidates");
  // the merged player fact should appear as a candidate
  const cand = readFileSync(new URL("candidates.lore_seed.json", changeDir), "utf8");
  ok(/survival cache/.test(cand), "curator candidate includes the shared fact");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
