// York — Shared Lore API (Vercel serverless function)
// GET  /api/lore?world=castaway       -> { world, nodes:[...], edges:[...], count }
// POST /api/lore  { world, nodes:[...] } -> { ok, merged, note }
//
// This is the SHARED tier of the three-tier memory architecture
// (local -> shared -> canonical). It merges player-generated lore that
// passes the ruleset, so new players bootstrap from a richer world.
// It NEVER writes to the canonical world doc; that is a human-curated
// PR (see scripts/curate-lore.mjs). Rules precedence is preserved:
// players may only PROPOSE; the engine + this validator ESTABLISH.
//
// Storage: @vercel/kv when deployed (VERCEL_KV_* env). Local dev falls
// back to a JSON file so the logic is testable without a KV binding.

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

// Static content checks derived from the world's constraints. The stateful
// "cannot leave until craft built" rule is enforced live by the engine; here
// we only block content that contradicts the world's fixed ecology/identity.
function forbiddenTerms(doc) {
  const base = ["magic portal", "dragon", "unicorn", "wizard", "fairy", "ghost ship of the damned"];
  const low = (doc && doc.constraints || []).join(" ").toLowerCase();
  if (/equatorial|reef|palm|jungle|tropical/.test(low)) {
    // equatorial castaway world: reject cold/temperate/volcanic life
    base.push("volcanic", "glacier", "polar", "tundra", "permafrost", "ice sheet", "snow leopard");
  } else if (/cold|volcanic|arctic|temperate/.test(low)) {
    // cold world: reject tropical life
    base.push("jungle", "palm tree", "tropical", "coral reef", "equator", "monsoon");
  }
  return base;
}

function validateNode(n, doc) {
  if (!n || typeof n !== "object") return "not an object";
  if (typeof n.text !== "string" || !n.text.trim()) return "missing text";
  if (n.text.length > 400) return "text too long (max 400)";
  const bad = forbiddenTerms(doc).find(t => n.text.toLowerCase().includes(t));
  if (bad) return `contradicts the world's ecology/identity constraints ("${bad}")`;
  // never accept 'spec'/'shared' sources from a client — they are server-assigned
  if (n.source === "spec" || n.source === "shared" || n.source === "canonical")
    return "forbidden source label";
  return null;
}

// --- storage: KV when available, else local file --------------------------
const KV_KEY = (world) => `york:lore:${world}`;
const LOCAL_FILE = join(__dirname, "..", ".cache", "shared-lore.json");

let kv = null;
async function getKV() {
  if (kv !== null) return kv;
  try {
    const mod = await import("@vercel/kv");
    if (mod && mod.kv) kv = mod.kv;
    else kv = false;
  } catch { kv = false; }
  return kv;
}

async function readGraph(world) {
  const k = await getKV();
  if (k) {
    const v = await k.get(KV_KEY(world));
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
  const k = await getKV();
  if (k) { await k.set(KV_KEY(graph.world), graph); return; }
  const all = existsSync(LOCAL_FILE) ? JSON.parse(readFileSync(LOCAL_FILE, "utf8")) : {};
  all[graph.world] = graph;
  mkdirSync(dirname(LOCAL_FILE), { recursive: true });
  writeFileSync(LOCAL_FILE, JSON.stringify(all, null, 2));
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
  const world = url.searchParams.get("world") || "meridian";
  const doc = loadWorld(world);

  if (req.method === "GET") {
    const g = await readGraph(world);
    return res.status(200).json({ world, nodes: g.nodes, edges: g.edges || [], count: g.nodes.length });
  }

  if (req.method === "POST") {
    let body;
    try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ ok: false, why: "invalid JSON body" }); }
    const incoming = Array.isArray(body && body.nodes) ? body.nodes : [];
    const g = await readGraph(world);

    let merged = 0, rejected = 0;
    const rejections = [];
    for (const n of incoming) {
      const why = validateNode(n, doc);
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
    if (merged) { g.edges = g.edges || []; await writeGraph(g); }
    return res.status(200).json({
      ok: true, merged, rejected,
      note: rejected ? `${rejected} node(s) rejected by the ruleset` : "all accepted",
      rejections: rejections.slice(0, 20),
    });
  }

  return res.status(405).json({ ok: false, why: "method not allowed" });
}
