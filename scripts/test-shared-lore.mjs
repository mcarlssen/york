// Headless test for the three-tier shared-memory layer.
// Exercises api/lore.js round-trip + validation using the local file fallback
// (no Vercel KV, no network). Run: node scripts/test-shared-lore.mjs

import { rmSync, existsSync, readFileSync } from "node:fs";

const CACHE = new URL("../.cache/shared-lore.json", import.meta.url);
// start clean so the test is deterministic
if (existsSync(new URL(CACHE))) rmSync(new URL(CACHE));

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
  await handler(mkReq("GET", "http://x/api/lore?world=castaway"), res);
  ok(res.statusCode === 200 && res.body.count === 0, "GET empty graph returns 0 nodes");
}

// --- 2. POST a valid castaway-ecology fact ---------------------------------
{
  const res = mkRes();
  const nodes = [{
    id: "p1", source: "play", text: "the jungle interior hides a fallen survival cache",
    tags: ["generated", "lore"], subject: "jungle", relation: "hides", object: "a survival cache",
  }];
  await handler(mkReq("POST", "http://x/api/lore", { world: "castaway", nodes }), res);
  ok(res.statusCode === 200 && res.body.merged === 1 && res.body.rejected === 0,
     "POST valid fact is merged");
}

// --- 3. POST a fact that contradicts equatorial ecology (rejected) ----------
{
  const res = mkRes();
  const nodes = [{ id: "p2", source: "play", text: "a glacier sits at the island's frozen core",
    tags: ["generated"], subject: "island", relation: "has", object: "a glacier" }];
  await handler(mkReq("POST", "http://x/api/lore", { world: "castaway", nodes }), res);
  ok(res.statusCode === 200 && res.body.merged === 0 && res.body.rejected === 1,
     "POST cold/volcanic fact is rejected by ruleset");
}

// --- 4. duplicate by id is not double-merged -------------------------------
{
  const res = mkRes();
  const nodes = [{ id: "p1", source: "play", text: "the jungle interior hides a fallen survival cache",
    tags: ["generated"], subject: "jungle", relation: "hides", object: "a survival cache" }];
  await handler(mkReq("POST", "http://x/api/lore", { world: "castaway", nodes }), res);
  ok(res.statusCode === 200 && res.body.merged === 0, "duplicate-by-id not re-merged");
}

// --- 5. similar text not double-merged -------------------------------------
{
  const res = mkRes();
  // shares 8/10 tokens with the stored p1 text -> Jaccard 0.8 > 0.75 threshold
  const nodes = [{ id: "p3", source: "play", text: "the jungle interior hides a fallen survival cache near the spring",
    tags: ["generated"], subject: "jungle", relation: "hides", object: "a survival cache" }];
  await handler(mkReq("POST", "http://x/api/lore", { world: "castaway", nodes }), res);
  ok(res.statusCode === 200 && res.body.merged === 0, "near-duplicate text not re-merged");
}

// --- 6. client may not claim canonical/spec source -------------------------
{
  const res = mkRes();
  const nodes = [{ id: "p4", source: "spec", text: "the player is the sole survivor of the Meridian",
    tags: [], subject: "player", relation: "is", object: "survivor" }];
  await handler(mkReq("POST", "http://x/api/lore", { world: "castaway", nodes }), res);
  ok(res.statusCode === 200 && res.body.rejected === 1, "forbidden source label rejected");
}

// --- 7. GET now reflects the one merged fact -------------------------------
{
  const res = mkRes();
  await handler(mkReq("GET", "http://x/api/lore?world=castaway"), res);
  ok(res.statusCode === 200 && res.body.count === 1 && res.body.nodes[0].source === "player",
     "GET reflects merged player fact");
}

// --- 8. curator script diffs shared vs canonical ---------------------------
{
  // run curator against local fallback (no --api)
  const { execSync } = await import("node:child_process");
  let out = "";
  try { out = execSync("node scripts/curate-lore.mjs castaway", { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8" }); }
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
