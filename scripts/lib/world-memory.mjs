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
  return { answer, facts, entities };
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
