// York — Shared Lore API (Vercel serverless function)
// GET  /api/lore?world=meridian       -> { world, nodes:[...], edges:[...], count }
// POST /api/lore  { world, nodes:[...] } -> { ok, merged, note }
// POST /api/llm   { system, user, maxTokens } -> { ok, content }  (LLM proxy; key stays server-side)
//
// This is the SHARED tier of the three-tier memory architecture
// (local -> shared -> canonical). It merges player-generated lore that
// passes the ruleset, so new players bootstrap from a richer world.
// It NEVER writes to the canonical world doc; that is a human-curated
// PR (see scripts/curate-lore.mjs). Rules precedence is preserved:
// players may only PROPOSE; the engine + this validator ESTABLISH.
//
// The /api/llm route also proxies player LLM calls (interpretation, world
// generation) so the OpenRouter key never ships to the client. The engine
// falls back to its offline parser whenever the proxy returns no content.
//
// Storage: Upstash Redis when deployed (UPSTASH_REDIS_REST_URL/_TOKEN env).
// Vercel KV was sunset; Redis/Upstash Redis is the supported store. Local dev
// falls back to a JSON file so the logic is testable without a Redis binding.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- load the canonical world doc to derive the ruleset -------------------
// The canonical world lives at openspec/world/world.json (single source of truth);
// the `world` arg selects which shared graph to read/write, not which file to load.
function loadWorld(world) {
  const candidates = [
    join(__dirname, "..", "openspec", "world", "world.json"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      try { return JSON.parse(readFileSync(c, "utf8")); } catch {}
    }
  }
  return null;
}

// --- canon context: the established world the candidate fact is checked against ----
// We feed the model the actual rules + seeded facts + ecology so it can judge
// contradiction semantically, not by matching banned words.
function canonContext(doc) {
  const parts = [];
  for (const c of (doc && doc.constraints || [])) parts.push("RULE: " + c);
  for (const e of (doc && doc.lore_seed || []))
    parts.push("FACT: " + [e.subject, e.relation, e.object].filter(Boolean).join(" "));
  const eco = (doc && doc.ecology) || {};
  for (const k of ["climate", "terrain", "flora", "fauna", "threats"]) {
    const v = eco[k];
    if (Array.isArray(v)) v.forEach(x => parts.push(`ECOLOGY ${k}: ${x}`));
    else if (v) parts.push(`ECOLOGY ${k}: ${v}`);
  }
  return parts.join("\n");
}

// Offline keyword heuristic — the fallback when no LLM is configured. Deliberately
// coarse: it catches the obvious contradictions but will false-positive/negative, which
// is exactly why the semantic path below is the primary check when available.
function forbiddenTerms(doc) {
  const base = ["magic portal", "dragon", "unicorn", "wizard", "fairy", "ghost ship of the damned"];
  const low = (doc && doc.constraints || []).join(" ").toLowerCase();
  if (/equatorial|reef|palm|jungle|tropical/.test(low)) {
    base.push("volcanic", "glacier", "polar", "tundra", "permafrost", "ice sheet", "snow leopard");
  } else if (/cold|volcanic|arctic|temperate/.test(low)) {
    base.push("jungle", "palm tree", "tropical", "coral reef", "equator", "monsoon");
  }
  return base;
}

function extractJSON(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/```json|```/g, "").trim();
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch { return null; }
}

// Semantic contradiction check. When a server-side OPENROUTER_API_KEY is set, the model
// judges whether the candidate fact conflicts with the established world. Returns
// { conflict, why } or null when no LLM is available (caller falls back to the heuristic).
// Degrades safely: any error/empty response => null (treated as "no verdict", not "reject").
async function semanticConflict(text, ctx) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const model = process.env.LORE_VALIDATOR_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free";
  const sys = `You are a world-consistency validator. Given an ESTABLISHED world (rules + facts) ` +
    `and a CANDIDATE fact, decide whether the candidate contradicts the established world. ` +
    `Answer ONLY JSON: {"conflict": true|false, "why": "short reason or empty"}. ` +
    `A conflict means the candidate asserts something impossible or contradictory in this world ` +
    `(e.g. cold life on an equatorial island, magic, a being the world explicitly omits). ` +
    `Merely adding new consistent detail (a new reef fish, a new tide pool) is NOT a conflict.`;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "http://localhost" },
      body: JSON.stringify({
        model, max_tokens: 200,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `ESTABLISHED WORLD:\n${ctx}\n\nCANDIDATE FACT:\n"${text}"` },
        ],
      }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const raw = (d.choices && d.choices[0] && d.choices[0].message && (d.choices[0].message.content || ""));
    const j = extractJSON(raw);
    if (!j || typeof j.conflict !== "boolean") return null;
    return { conflict: j.conflict, why: j.why || "" };
  } catch {
    return null;
  }
}

// Validate a single pushed node. Async because the semantic check may call the LLM.
// Order: shape -> source label -> semantic (LLM, if configured) -> keyword heuristic fallback.
async function validateNode(n, doc) {
  if (!n || typeof n !== "object") return "not an object";
  if (typeof n.text !== "string" || !n.text.trim()) return "missing text";
  if (n.text.length > 400) return "text too long (max 400)";
  // never accept 'spec'/'shared' sources from a client — they are server-assigned
  if (n.source === "spec" || n.source === "shared" || n.source === "canonical")
    return "forbidden source label";
  const tags = Array.isArray(n.tags) ? n.tags : [];
  // player-state facts (clothing/held) are not world-ecology claims — skip semantic LLM
  // (it false-rejects them); still run the keyword heuristic.
  const playerState = tags.includes("player") || tags.includes("state");
  if (!playerState) {
    const sem = await semanticConflict(n.text, canonContext(doc));
    if (sem && sem.conflict) return `contradicts the world's established canon (${sem.why})`;
  }
  // offline fallback: coarse keyword heuristic when no LLM is configured
  const bad = forbiddenTerms(doc).find(t => n.text.toLowerCase().includes(t));
  if (bad) return `contradicts the world's ecology/identity constraints ("${bad}")`;
  return null;
}

export { validateNode, semanticConflict, forbiddenTerms, canonContext };

// --- LLM proxy: players never see the key; the server holds OPENROUTER_API_KEY ----
// Engine POSTs { system, user, maxTokens } here; we forward to OpenRouter and return
// { content }. Any failure returns { content: null } so the engine falls back to its
// offline parser. The interpreter/generator/predict models are configurable via
// YORK_LLM_MODEL (defaults to the engine's pinned free slug).
// Returns { content, status, code }. status: ok | empty | rate_limit | server_error | no_key
async function callOpenRouter(system, user, maxTokens) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { content: null, status: "no_key", code: 0 };
  const model = process.env.YORK_LLM_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free";
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "http://localhost" },
      body: JSON.stringify({ model, max_tokens: maxTokens || 200, messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ] }),
    });
    if (r.status === 429) return { content: null, status: "rate_limit", code: 429 };
    if (!r.ok) return { content: null, status: "server_error", code: r.status };
    const d = await r.json();
    const content = (d.choices && d.choices[0] && d.choices[0].message && (d.choices[0].message.content || "")) || null;
    return { content, status: content ? "ok" : "empty", code: r.status };
  } catch {
    return { content: null, status: "server_error", code: 0 };
  }
}
// Vercel KV was sunset; Upstash Redis (or Redis) is the supported store. Set
// UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (the REST credentials from
// your Upstash database) to enable persistence. Without them, the function falls
// back to a local JSON file so the logic is testable in dev.
const STORE_KEY = (world) => `york:lore:${world}`;
const LOCAL_FILE = join(__dirname, "..", ".cache", "shared-lore.json");

let redis = null;
async function getRedis() {
  if (redis !== null) return redis;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const mod = await import("@upstash/redis");
      if (mod && mod.Redis) redis = new mod.Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      else redis = false;
    } catch { redis = false; }
  } else {
    redis = false;
  }
  return redis;
}

async function readGraph(world) {
  const r = await getRedis();
  if (r) {
    const v = await r.get(STORE_KEY(world));
    return v || { world, nodes: [], edges: [] };
  }
  if (existsSync(LOCAL_FILE)) {
    try {
      const all = JSON.parse(readFileSync(LOCAL_FILE, "utf8"));
      return all[world] || { world, nodes: [], edges: [] };
    } catch {}
  }
  return { world, nodes: [], edges: [] };
}

async function writeGraph(graph) {
  const r = await getRedis();
  if (r) { await r.set(STORE_KEY(graph.world), graph); return { store: "redis" }; }
  // Vercel lambdas have ephemeral disks — a write here is invisible to the next request.
  if (process.env.VERCEL) {
    const err = new Error("no_durable_store");
    err.code = "no_durable_store";
    throw err;
  }
  const all = existsSync(LOCAL_FILE) ? JSON.parse(readFileSync(LOCAL_FILE, "utf8")) : {};
  all[graph.world] = graph;
  mkdirSync(dirname(LOCAL_FILE), { recursive: true });
  writeFileSync(LOCAL_FILE, JSON.stringify(all, null, 2));
  return { store: "file" };
}

async function storeKind() {
  if (await getRedis()) return "redis";
  if (process.env.VERCEL) return "ephemeral";
  return existsSync(LOCAL_FILE) ? "file" : "empty";
}

// de-dup: same id, or near-identical text, is treated as already present
function similar(a, b) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const wa = new Set(na.split(" ")), wb = new Set(nb.split(" "));
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  const j = overlap / (wa.size + wb.size - overlap);
  return j > 0.75;
}

export default async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  const world = url.searchParams.get("world") || "meridian";
  const doc = loadWorld(world);

  if (req.method === "GET" && path === "/api/lore") {
    const g = await readGraph(world);
    const store = await storeKind();
    return res.status(200).json({
      world, nodes: g.nodes, edges: g.edges || [], count: g.nodes.length, store,
      note: store === "ephemeral"
        ? "No durable store configured (set UPSTASH_REDIS_REST_URL/_TOKEN). Writes will not persist on Vercel."
        : undefined,
    });
  }

  if (req.method === "POST" && path === "/api/lore") {
    let body;
    try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ ok: false, why: "invalid JSON body" }); }
    const incoming = Array.isArray(body && body.nodes) ? body.nodes : [];
    const g = await readGraph(world);

    let merged = 0, rejected = 0;
    const rejections = [];
    for (const n of incoming) {
      const why = await validateNode(n, doc);
      if (why) { rejected++; rejections.push({ id: n.id, why }); continue; }
      const dup = g.nodes.find(ex => ex.id === n.id || similar(ex.text, n.text));
      if (dup) { continue; }
      g.nodes.push({
        id: n.id,
        subject: n.subject || "",
        relation: n.relation || "",
        object: n.object || "",
        text: n.text,
        tags: Array.isArray(n.tags) ? n.tags.concat("shared") : ["shared"],
        source: "player",
        world,
      });
      merged++;
    }
    if (merged) {
      g.edges = g.edges || [];
      try {
        await writeGraph(g);
      } catch (e) {
        if (e && e.code === "no_durable_store") {
          return res.status(503).json({
            ok: false, merged: 0, rejected, rejections: rejections.slice(0, 20),
            why: "no_durable_store",
            note: "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN — Vercel has no persistent filesystem.",
          });
        }
        throw e;
      }
    }
    return res.status(200).json({
      ok: true, merged, rejected,
      note: rejected ? `${rejected} node(s) rejected by the ruleset` : "all accepted",
      rejections: rejections.slice(0, 20),
      store: await storeKind(),
    });
  }

  if (req.method === "POST" && path === "/api/llm") {
    let body;
    try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ ok: false, why: "invalid JSON body" }); }
    const out = await callOpenRouter(body.system, body.user, body.maxTokens);
    if (out.status === "rate_limit") return res.status(429).json({ ok: false, content: null, why: "rate_limit" });
    if (out.status === "no_key") return res.status(503).json({ ok: false, content: null, why: "no_key" });
    if (out.status === "server_error") return res.status(502).json({ ok: false, content: null, why: "upstream", code: out.code });
    return res.status(200).json({ ok: true, content: out.content });
  }

  return res.status(404).json({ ok: false, why: "not found" });
}
