// York — Lore Curator
//
// Pulls the SHARED lore graph and promotes vetted player discoveries into the
// CANONICAL world doc (openspec/world/<world>.json) via an OpenSpec change.
//
// The shared tier is open and rule-validated, but it is not vetted for quality,
// consistency, or tone — that is a human call. This script:
//   1. fetches GET /api/lore?world=<world>  (or reads the local .cache file)
//   2. diffs shared nodes against the canonical lore_seed + ecology
//   3. emits candidate facts the curator can copy into world.json's lore_seed
//   4. writes an OpenSpec change (proposal + design + tasks + spec delta) so the
//      promotion is reviewable as a PR, not a silent edit.
//
// Usage:  node scripts/curate-lore.mjs [world] [--api https://your-vercel.url]
//   world defaults to "meridian". Without --api it reads .cache/shared-lore.json
//   (the local fallback written by api/lore.js in dev).
//
// It does NOT auto-merge into world.json. Curators review the change, edit
// the world doc, and land the PR. That is the "curated, not crowd-written"
// boundary of the three-tier architecture.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const WORLD = process.argv[2] || "meridian";
const apiIdx = process.argv.indexOf("--api");
const API = apiIdx >= 0 ? process.argv[apiIdx + 1] : null;
const DATE = new Date().toISOString().slice(0, 10);
const CHANGE = `${DATE}-curate-shared-lore`;

function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function similar(a, b) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const na = norm(a), nb = norm(b);
  if (!na || !nb || na === nb) return na === nb;
  const wa = new Set(na.split(" ")), wb = new Set(nb.split(" "));
  let overlap = 0; for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / (wa.size + wb.size - overlap) > 0.75;
}

async function getShared() {
  if (API) {
    const r = await fetch(`${API}/api/lore?world=${WORLD}`);
    if (!r.ok) throw new Error(`GET shared failed: ${r.status}`);
    return (await r.json()).nodes || [];
  }
  const local = join(ROOT, ".cache", "shared-lore.json");
  if (!existsSync(local)) throw new Error(`No --api given and no ${local}. Run the dev server or push first.`);
  const all = JSON.parse(readFileSync(local, "utf8"));
  return (all[WORLD] && all[WORLD].nodes) || [];
}

function canonicalTexts(worldDoc) {
  const texts = [];
  for (const e of (worldDoc.lore_seed || [])) texts.push(e.object || e.subject || "");
  const eco = worldDoc.ecology || {};
  for (const k of ["climate", "terrain", "flora", "fauna", "threats"]) {
    const v = eco[k];
    if (Array.isArray(v)) v.forEach(x => texts.push(x));
    else if (v) texts.push(v);
  }
  return texts;
}

function loadWorldDoc() {
  const worldPath = join(ROOT, "openspec", "world", "world.json");
  if (!existsSync(worldPath)) throw new Error(`No canonical world doc at ${worldPath}`);
  return { worldDoc: JSON.parse(readFileSync(worldPath, "utf8")), worldPath };
}

async function run() {
  const { worldDoc, worldPath } = loadWorldDoc();
  const shared = await getShared();
  const existing = canonicalTexts(worldDoc);

  const candidates = [];
  for (const n of shared) {
    if (n.source !== "player") continue; // only player-contributed, shared-tier facts
    const isNew = !existing.some(t => similar(t, n.text));
    if (isNew) candidates.push(n);
  }

  if (!candidates.length) {
    console.log(`No new candidate lore for "${WORLD}" — shared graph is fully subsumed by canon.`);
    return;
  }

  // Build an OpenSpec change so the promotion is a reviewable PR, not a silent edit.
  const changeDir = join(ROOT, "openspec", "changes", CHANGE);
  mkdirSync(join(changeDir, "specs", "world-rules"), { recursive: true });

  const proposal = `# Curate Shared Lore → Canon (${WORLD})

Date: ${DATE}
World: ${WORLD} (${worldDoc.identity && worldDoc.identity.title})

## Why
The SHARED tier (api/lore.js) accumulates player-generated lore that has passed
the ruleset. It is open and rule-checked but NOT vetted for quality, tone, or
narrative fit. Canonical world truth must remain human-curated. This change
proposes promoting the candidate facts below into \`world.json\`'s \`lore_seed\`
after curator review.

## Candidates (copied from shared graph — REVIEW before merging)
${candidates.map((c, i) => `${i + 1}. [${c.tags ? c.tags.join(",") : ""}] ${c.text}`).join("\n")}

## Process
1. Curator reviews each candidate; rejects duplicates, low-quality, or off-tone facts.
2. Accepted facts are appended to \`lore_seed\` in \`openspec/world/world.json\`
   with a fresh \`id\` and appropriate \`tags\`.
3. This change is merged via PR; the shared graph is left intact (shared is the
   input, canon is the curated output — they do not collide).

## Boundary upheld
Players and the LLM never write the canonical doc. Only this curator flow does.
`;

  const tasks = `# Tasks — Curate Shared Lore (${WORLD})

- [ ] Review each candidate fact for quality, tone, and consistency with constraints
- [ ] Append accepted facts to \`lore_seed\` in \`openspec/world/world.json\`
- [ ] Assign fresh \`id\`s and \`tags\` to accepted facts
- [ ] Land this change via PR (do NOT merge shared graph directly into canon)
`;

  const specDelta = `# World Rules — spec delta (proposed)

## ADDED Requirements

### Requirement: Curated promotion of shared lore
The canonical world doc is the single source of truth and MUST only be modified
through a human-curated change (OpenSpec PR). Player-contributed lore from the
shared tier MAY be promoted into \`lore_seed\` only after curator review, never
automatically.

#### Scenario: shared fact is promoted
- GIVEN a shared-tier fact that passes the ruleset and is not already in canon
- WHEN the curator reviews and accepts it
- THEN it is appended to \`lore_seed\` with a fresh id and tags, and the change is
  landed via PR.

#### Scenario: shared fact is rejected
- GIVEN a shared-tier fact that is low-quality, off-tone, or duplicative
- WHEN the curator rejects it
- THEN it is NOT added to canon and the shared graph retains it unchanged.
`;

  writeFileSync(join(changeDir, "proposal.md"), proposal);
  writeFileSync(join(changeDir, "tasks.md"), tasks);
  writeFileSync(join(changeDir, "design.md"),
    `# Design — Curate Shared Lore\n\nThis change is produced by \`scripts/curate-lore.mjs\`.\nIt diffs the SHARED graph against the CANONICAL \`lore_seed\`/ecology and emits\ncandidate facts for human review. No automatic writes to the canonical doc.\n`);
  writeFileSync(join(changeDir, "specs", "world-rules", "spec.md"), specDelta);

  // Also emit a copy-paste block for the world doc itself.
  const seedBlock = candidates.map((c, i) =>
    `    { "id": "shared_${DATE}_${i + 1}", "subject": ${JSON.stringify(c.subject || "the world")}, "relation": ${JSON.stringify(c.relation || "includes")}, "object": ${JSON.stringify(c.text)}, "tags": ${JSON.stringify((c.tags || []).concat("shared", "curated"))} }`
  ).join(",\n");
  writeFileSync(join(changeDir, "candidates.lore_seed.json"),
    `[\n${seedBlock}\n]\n`);

  console.log(`Wrote OpenSpec change: openspec/changes/${CHANGE}`);
  console.log(`  candidates: ${candidates.length}`);
  console.log(`  review: openspec/changes/${CHANGE}/proposal.md`);
  console.log(`  paste-ready lore_seed entries: openspec/changes/${CHANGE}/candidates.lore_seed.json`);
}

run().catch(e => { console.error("curate-lore failed:", e.message); process.exit(1); });
