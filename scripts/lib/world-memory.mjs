// Pure helpers for lore JSON salvage + WORLD mutation persistence.
// Mirrored by call sites in index.html (browser has no bundler).

/** Parse lore {answer,facts,entities}; salvage truncated JSON when needed. */
export function salvageLoreJSON(raw) {
  if (!raw) return null;
  const full = extractJSON(raw);
  if (full && full.answer) {
    return {
      answer: String(full.answer),
      facts: Array.isArray(full.facts) ? full.facts.map(String) : [],
      playerFacts: Array.isArray(full.playerFacts) ? full.playerFacts.map(String) : [],
      entities: Array.isArray(full.entities) ? full.entities : [],
    };
  }
  const s = String(raw);
  const answerM = s.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!answerM) return null;
  let answer = answerM[1].replace(/\\"/g, '"').replace(/\\n/g, " ");
  const facts = [];
  const factsM = s.match(/"facts"\s*:\s*\[([\s\S]*?)(?:\]|$)/);
  if (factsM) {
    for (const m of factsM[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      facts.push(m[1].replace(/\\"/g, '"'));
    }
  }
  const entities = [];
  const entRe =
    /\{\s*"id"\s*:\s*"([^"]+)"\s*,\s*"name"\s*:\s*"([^"]+)"(?:\s*,\s*"portable"\s*:\s*(true|false))?(?:\s*,\s*"desc"\s*:\s*"((?:[^"\\]|\\.)*)")?/g;
  for (const m of s.matchAll(entRe)) {
    entities.push({
      id: m[1],
      name: m[2],
      portable: m[3] !== "false",
      desc: m[4] ? m[4].replace(/\\"/g, '"') : undefined,
    });
  }
  // held flags on truncated entities
  for (const e of entities) {
    const heldM = s.match(
      new RegExp('"id"\\s*:\\s*"' + e.id + '"[\\s\\S]{0,120}"held"\\s*:\\s*(true|false)')
    );
    if (heldM) e.held = heldM[1] === "true";
  }
  const playerFacts = [];
  const pfM = s.match(/"playerFacts"\s*:\s*\[([\s\S]*?)(?:\]|$)/);
  if (pfM) {
    for (const m of pfM[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      playerFacts.push(m[1].replace(/\\"/g, '"'));
    }
  }
  return { answer, facts, playerFacts, entities };
}

export function extractJSON(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/```json|```/g, "").trim();
  const i = s.indexOf("{"),
    j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** True if string is mostly leaked model JSON, not player-facing prose. */
export function isJsonDump(s) {
  const t = String(s || "").trim();
  return /^\{/.test(t) && /"answer"\s*:/.test(t);
}

/**
 * Snapshot mutations vs a seed world snapshot.
 * seed: { items, nodes } plain objects from the world doc.
 * live: { items, nodes } current WORLD.
 */
export function captureWorldDelta(seed, live) {
  const items = {};
  for (const id of Object.keys(live.items || {})) {
    if (!seed.items[id]) items[id] = live.items[id];
  }
  const nodeItems = {};
  const extraNodes = {};
  const exits = {};
  for (const [nid, n] of Object.entries(live.nodes || {})) {
    if (!seed.nodes[nid]) {
      extraNodes[nid] = n;
      continue;
    }
    const seedItems = seed.nodes[nid].items || [];
    const cur = n.items || [];
    if (JSON.stringify(cur) !== JSON.stringify(seedItems)) {
      nodeItems[nid] = cur.slice();
    }
    const seedExits = seed.nodes[nid].exits || {};
    for (const [ek, dest] of Object.entries(n.exits || {})) {
      if (seedExits[ek] !== dest) {
        if (!exits[nid]) exits[nid] = {};
        exits[nid][ek] = dest;
      }
    }
  }
  return { items, nodeItems, extraNodes, exits };
}

export function applyWorldDelta(live, delta) {
  if (!delta) return live;
  for (const [id, it] of Object.entries(delta.items || {})) {
    live.items[id] = it;
  }
  for (const [nid, n] of Object.entries(delta.extraNodes || {})) {
    live.nodes[nid] = n;
  }
  for (const [nid, items] of Object.entries(delta.nodeItems || {})) {
    if (live.nodes[nid]) live.nodes[nid].items = items.slice();
  }
  for (const [nid, ex] of Object.entries(delta.exits || {})) {
    if (!live.nodes[nid]) continue;
    live.nodes[nid].exits = Object.assign({}, live.nodes[nid].exits || {}, ex);
  }
  return live;
}

/** Place catalog item ids mentioned in text onto a location's items list. */
export function placeCatalogMentions(itemsCatalog, nodeItems, inv, text) {
  const blob = String(text || "").toLowerCase();
  const out = (nodeItems || []).slice();
  const held = new Set(inv || []);
  for (const id of Object.keys(itemsCatalog || {})) {
    if (held.has(id) || out.includes(id)) continue;
    if (itemsCatalog[id] && itemsCatalog[id].portable === false) continue;
    const name = String((itemsCatalog[id] && itemsCatalog[id].name) || id).toLowerCase();
    const idSp = id.replace(/_/g, " ");
    const re = new RegExp("\\b" + idSp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
    const reName = new RegExp("\\b" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
    if (re.test(blob) || reName.test(blob)) out.push(id);
  }
  return out;
}

/** Craft / body actions must not go through multi-take ("take off X, and fill…"). */
export function isCraftTakeTarget(t) {
  const s = String(t || "").toLowerCase().trim();
  if (/^off\b/.test(s)) return true;
  return /\b(fill|make|craft|wear|tie|wrap|sew|stuff|swing|wield)\b/.test(s);
}

/** Site recipe builds — not freestyle improvise. */
export function isSiteBuild(text) {
  return /\b(build|craft)\s+(?:a\s+|the\s+)?(raft|pyre|shelter|balloon)\b/i.test(String(text || ""));
}

/**
 * Freestyle craft / assemble intent (club, lash, bind).
 * Excludes site builds and "make signal".
 */
export function isImproviseIntent(text) {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return false;
  if (isSiteBuild(t)) return false;
  if (/\b(make|build)\s+signal\b/.test(t)) return false;
  if (/\b(make|improvise|fashion|lash|tie|bind|affix)\b/.test(t)) return true;
  if (/\bcraft\b/.test(t)) return true;
  if (/\buse\b[\s\S]{0,100}\bto\b[\s\S]{0,60}\b(tie|lash|bind|make|attach|affix|fix|secure)\b/.test(t)) return true;
  if (/\b(make|craft|fashion)\b[\s\S]{0,80}\b(with|from|using)\b/.test(t)) return true;
  return false;
}

/** Parse improvise pass/fail JSON (incl. light salvage). */
export function salvageImproviseJSON(raw) {
  if (!raw) return null;
  const full = extractJSON(raw);
  if (full && typeof full.ok === "boolean") {
    const result =
      full.result && (full.result.id || full.result.name)
        ? {
            id: String(full.result.id || full.result.name)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_|_$/g, ""),
            name: String(full.result.name || full.result.id),
            desc: full.result.desc ? String(full.result.desc) : undefined,
          }
        : null;
    return {
      ok: !!full.ok,
      answer: full.answer ? String(full.answer) : "",
      result: result && result.id ? result : null,
      consume: Array.isArray(full.consume) ? full.consume.map(String) : [],
      playerFacts: Array.isArray(full.playerFacts) ? full.playerFacts.map(String) : [],
      why: full.why != null ? String(full.why) : null,
    };
  }
  const s = String(raw);
  const okM = s.match(/"ok"\s*:\s*(true|false)/);
  if (!okM) return null;
  const answerM = s.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const idM = s.match(/"id"\s*:\s*"([^"]+)"/);
  const nameM = s.match(/"name"\s*:\s*"([^"]+)"/);
  return {
    ok: okM[1] === "true",
    answer: answerM ? answerM[1].replace(/\\"/g, '"') : "",
    result:
      idM && okM[1] === "true"
        ? { id: idM[1], name: nameM ? nameM[1] : idM[1], desc: undefined }
        : null,
    consume: [],
    playerFacts: [],
    why: null,
  };
}

/**
 * Simple multi-take targets ("fig and bamboo"), or null if this is one craft/compound act.
 * Single item → [item]. Empty → [].
 */
export function splitSimpleTakeTargets(t) {
  const raw = String(t || "").trim();
  if (!raw) return [];
  if (isCraftTakeTarget(raw)) return null;
  const parts = raw.split(/\s+and\s+|,\s*/).map((x) => x.trim()).filter(Boolean);
  if (parts.length <= 1) return parts;
  if (
    parts.every(
      (p) => p.split(/\s+/).length <= 4 && !/\b(fill|make|off|with|from|into|wear)\b/i.test(p)
    )
  ) {
    return parts;
  }
  return null;
}

/** Strip quantity / source fluff so "bag of pebbles from the shingle" → "pebbles". */
export function normalizeItemTarget(t) {
  return String(t || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^(a|an|the|some|my)\s+/, "")
    .replace(/\b(bag|handful|piece|pile|bunch|few|lot|armful)\s+(of\s+)?/g, "")
    .replace(/\s+from\s+.+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Crafted / wielded entities go to inventory, not the ground. */
export function shouldHoldEntity(entity, playerQuery) {
  if (entity && (entity.held === true || entity.held === "true")) return true;
  const q = String(playerQuery || "").toLowerCase();
  return /\b(take off|fill|make|craft|swing|wield|wear|hold|carry|in my (hand|grip|inventory|pack|bag)|put .+ in my|flail|weapon)\b/.test(
    q
  );
}

/** Pull playerFacts from structured lore; also infer from "you are wearing…" prose. */
export function collectPlayerFacts(lore) {
  const out = [];
  const seen = new Set();
  function add(s) {
    const t = String(s || "").trim();
    if (!t || t.length < 8 || t.length > 200) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  }
  for (const f of (lore && lore.playerFacts) || []) add(f);
  const blob = [lore && lore.answer]
    .concat((lore && lore.facts) || [])
    .filter(Boolean)
    .join(" ");
  const re =
    /\b(?:you(?:'re| are| were)|you(?:'ve| have))\s+(?:wearing|holding|carrying|holding onto)[^.?!]+[.?!]?/gi;
  for (const m of blob.matchAll(re)) add(m[0].trim());
  return out;
}
