# York — Shared Memory Round-Trip Architecture

Complete trace: `genLore` → LOCAL → auto-contribute → SHARED (Redis) → curation → CANONICAL

---

## 1. Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         THREE-TIER MEMORY ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   LOCAL (browser)          SHARED (server KV)         CANONICAL (repo)      │
│   ─────────────────        ───────────────────        ──────────────────    │
│   localStorage             Upstash Redis               openspec/world/      │
│   LoreGraph                /api/lore                   world.json           │
│   private                  merged, validated           single source       │
│   per-player               cross-player                of truth            │
│                                                                              │
│   ─────────────────        ───────────────────        ──────────────────    │
│         │                        │                        │                 │
│         │ collectContributions   │                        │                 │
│         ▼                        │                        │                 │
│   ┌─────────┐                    │                        │                 │
│   │ pushLore├────────────────────┤                        │                 │
│   └─────────┘   POST /api/lore   │                        │                 │
│                        │         │                        │                 │
│                        ▼         │                        │                 │
│                  validateNode()  │                        │                 │
│                        │         │                        │                 │
│                        ▼         │                        │                 │
│                  writeGraph()    │                        │                 │
│                        │         │                        │                 │
│                        ▼         │                        │                 │
│                  ┌─────────────┐  │                        │                 │
│                  │ Upstash     │  │                        │                 │
│                  │ Redis       │  │                        │                 │
│                  └─────────────┘  │                        │                 │
│                        │         │                        │                 │
│                  GET /api/lore   │                        │                 │
│                        │         │                        │                 │
│         pullLore ◄─────┴─────────┤                        │                 │
│         (bootstrap)              │                        │                 │
│                        │         │                        │                 │
│         curate-lore.mjs ◄────────┘                        │                 │
│                        │                                   │                 │
│                        ▼                                   ▼                 │
│                  OpenSpec change ──────────► world.json (PR merge)         │
│                  (proposal.md)                                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Principle:** Players/LLM *propose* → Engine + Validator *establish* (shared) → Curator *promotes* (canonical). Never auto-write canon.

---

## 2. Full Round-Trip Trace

### Step 1: LLM Generates World Fact (`genLore`)

**File:** `index.html`  
**Function:** `genLore(text)` — line ~963

```javascript
async function genLore(text){
  const ctx = text + " " + node().name;
  const relevant = LORE.retrieve(ctx, 5).map(n=>"- "+n.text).join("\n");
  const sys = `You are the world-builder for York... Answer with ONE factual sentence.`;
  const c = await llmText(sys, text, 120);
  return cleanGeneration(c);
}
```

**Triggered by:** `doAsk`, `doExamine` returning `{pendingGen:{type:"lore", query}}`  
**Result:** Single sentence fact string (e.g., "The tide pools contain edible mussels and hermit crabs.")

---

### Step 2: Commit to Local LoreGraph

**File:** `index.html`  
**Function:** `commitLore(key, fact, opts)` — line ~757

```javascript
function commitLore(key, fact, opts){
  if(!fact) return;
  opts = opts || {};
  const stableId = opts.id || key || ("T"+(LORE.seq+1));
  LORE.commit(key, "is", fact, { 
    source:"play",                    // or "generated" for LLM facts
    tags: opts.tags||["discovered"], 
    turn: S.clock,
    id: stableId, 
    text: opts.text || fact 
  });
  persistLore();  // localStorage
}
```

**Called from:** `playerTurn` after `genLore` resolves (line ~1107)

```javascript
const fact = await genLore(res.pendingGen.query);
pushLog(fact, "llm");
commitLore("gen:"+(LORE.seq+1), fact, {tags:["generated","lore"], text:fact});
maybeAddLoreItemsToLocation(fact);  // NEW: also registers interactable items
```

**Result:** Node added to `LORE.nodes` with `source: "play"` or `"generated"`, persisted to `localStorage` key `york_lore_v1:meridian`.

---

### Step 3: Auto-Contribute at Session End

**File:** `index.html`  
**Function:** `autoContribute()` — line ~404

```javascript
async function autoContribute(){
  const r = await pushLore();
  if(r.ok && r.pushed>0){
    pushLog(`Your discoveries drift out with the tide — ${r.pushed} shared...`,"fog");
  }
  // failures are intentionally silent
}
```

**Triggered by:** `showEnd()` at game over / restart (line ~1256)

```javascript
function showEnd(title,body,cls){
  // ...
  autoContribute(); // share this session's discoveries with the wider world
}
```

---

### Step 4: Collect Contributions (LOCAL → payload)

**File:** `index.html`  
**Function:** `collectContributions()` — line ~328

```javascript
function collectContributions(){
  const out = [];
  for(const n of Object.values(LORE.nodes)){
    if(n.source==="play" || n.source==="generated" || (n.tags&&n.tags.includes("generated"))){
      out.push({ 
        id:n.id, subject:n.subject, relation:n.relation, object:n.object,
        text:n.text, tags:n.tags||[], source:n.source, world:WORLD_ID 
      });
    }
  }
  return out;
}
```

**Filters:** Only `source: "play"`, `"generated"`, or tagged `"generated"` — excludes spec-seeded baseline (`source: "spec"`).

---

### Step 5: Client Pre-Filter

**File:** `index.html`  
**Function:** `validateFactClient(text)` — line ~333

```javascript
function validateFactClient(text){
  const t = String(text||"").toLowerCase();
  if(/jungle|palm tree|tropical|coral reef|equator|magic portal|dragon|unicorn/.test(t))
    return "contradicts the world's ecology/identity constraints";
  return null;
}
```

**Purpose:** Catches obvious contradictions before network call. Best-effort; server re-validates.

---

### Step 6: POST to `/api/lore` (SHARED tier)

**File:** `index.html`  
**Function:** `pushLore()` — line ~350

```javascript
async function pushLore(){
  const nodes = collectContributions();
  if(!nodes.length) return { ok:true, pushed:0, skipped:0, note:"nothing new to share" };
  
  let pushed=0, skipped=0;
  const clean = nodes.filter(n=>{
    const why = validateFactClient(n.text);
    if(why){ skipped++; return false; }
    pushed++; return true;
  });
  
  try{
    const r = await fetch(API_BASE+"/lore",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ world:WORLD_ID, nodes:clean })
    });
    if(!r.ok) return { ok:false, pushed:0, skipped, why:"server rejected ("+r.status+")" };
    const d = await r.json().catch(()=>({}));
    return { ok:true, pushed: pushed, skipped: skipped, merged: d.merged||pushed, note:d.note||"" };
  }catch(e){ return { ok:false, pushed:0, skipped, why:"network error (offline floor intact)" }; }
}
```

**API_BASE:** `window.YORK_API_BASE` or `/api` (relative, same-origin on Vercel)

---

### Step 7: Server Validation (`api/lore.js`)

**File:** `api/lore.js`  
**Handler:** `POST /api/lore` — line ~236

```javascript
if (req.method === "POST" && path === "/api/lore") {
  const incoming = Array.isArray(body && body.nodes) ? body.nodes : [];
  const g = await readGraph(world);
  
  let merged = 0, rejected = 0;
  const rejections = [];
  for (const n of incoming) {
    const why = await validateNode(n, doc);  // ← semantic + keyword check
    if (why) { rejected++; rejections.push({ id: n.id, why }); continue; }
    
    const dup = g.nodes.find(ex => ex.id === n.id || similar(ex.text, n.text));
    if (dup) { continue; }  // dedupe by ID or >0.75 Jaccard similarity
    
    g.nodes.push({
      id: n.id,
      subject: n.subject || "",
      relation: n.relation || "",
      object: n.object || "",
      text: n.text,
      tags: Array.isArray(n.tags) ? n.tags.concat("shared") : ["shared"],
      source: "player",      // ← server assigns source
      world,
    });
    merged++;
  }
  if (merged) { g.edges = g.edges || []; await writeGraph(g); }
  return res.status(200).json({ ok: true, merged, rejected, note, rejections });
}
```

---

### Step 8: Node Validation (`validateNode`)

**File:** `api/lore.js`  
**Function:** `validateNode(n, doc)` — line ~120

```javascript
async function validateNode(n, doc) {
  // Shape checks
  if (!n || typeof n !== "object") return "not an object";
  if (typeof n.text !== "string" || !n.text.trim()) return "missing text";
  if (n.text.length > 400) return "text too long (max 400)";
  if (n.source === "spec" || n.source === "shared" || n.source === "canonical")
    return "forbidden source label";  // client cannot claim privileged sources

  // Primary: Semantic contradiction check via LLM
  const sem = await semanticConflict(n.text, canonContext(doc));
  if (sem && sem.conflict) return `contradicts the world's established canon (${sem.why})`;

  // Fallback: Keyword heuristic when no LLM key configured
  const bad = forbiddenTerms(doc).find(t => n.text.toLowerCase().includes(t));
  if (bad) return `contradicts the world's ecology/identity constraints ("${bad}")`;

  return null;  // accepted
}
```

**Semantic check** (`semanticConflict`, line ~85): Calls OpenRouter with `LORE_VALIDATOR_MODEL` (default `openai/gpt-4o-mini`) against `canonContext(doc)` — the full constraints + lore_seed + ecology from `world.json`.

**Keyword fallback** (`forbiddenTerms`, line ~62): Coarse banned-word list derived from world ecology.

---

### Step 9: Redis Persistence (`writeGraph`)

**File:** `api/lore.js`  
**Functions:** `readGraph`/`writeGraph` — line ~188

```javascript
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
  } else { redis = false; }
  return redis;
}

async function writeGraph(graph) {
  const r = await getRedis();
  if (r) { await r.set(STORE_KEY(graph.world), graph); return; }
  // Local fallback
  const all = existsSync(LOCAL_FILE) ? JSON.parse(readFileSync(LOCAL_FILE, "utf8")) : {};
  all[graph.world] = graph;
  mkdirSync(dirname(LOCAL_FILE), { recursive: true });
  writeFileSync(LOCAL_FILE, JSON.stringify(all, null, 2));
}
```

**Key:** `york:lore:meridian` (Upstash Redis REST)  
**Fallback:** `.cache/shared-lore.json` for local dev

---

### Step 10: Bootstrap New Players (`pullLore`)

**File:** `index.html`  
**Function:** `pullLore()` — line ~364

```javascript
async function pullLore(){
  try{
    const r = await fetch(API_BASE+"/lore?world="+encodeURIComponent(WORLD_ID));
    if(!r.ok) return { ok:false, why:"server unavailable (using local + spec seed)" };
    const d = await r.json().catch(()=>({}));
    const shared = (d&&d.nodes)||[];
    let added=0;
    for(const n of shared){
      // Never overwrite local node (local precedence)
      if(LORE.nodes[n.id]) continue;
      LORE.commit(n.subject, n.relation, n.object,
        { id:n.id, source:n.source||"shared", tags:(n.tags||[]).concat("shared"), turn:n.turn||0 });
      added++;
    }
    if(added) persistLore();
    return { ok:true, added };
  }catch(e){ return { ok:false, why:"network error (using local + spec seed)" }; }
}
```

**Called from:** `newGame()` — line ~426

```javascript
pullLore().then(r=>{
  if(r.ok && r.added>0){
    pushLog(`The wider world remembers ${r.added} thing(s) others learned here.`,"fog");
    render();
  }
});
```

---

### Step 11: Curation (SHARED → CANONICAL)

**File:** `scripts/curate-lore.mjs` — run manually by curator

```bash
node scripts/curate-lore.mjs [world] [--api https://your-vercel.url]
```

**Process:**
1. Fetches shared graph from `/api/lore?world=meridian` (or local fallback)
2. Loads canonical `world.json` from `openspec/world/world.json`
3. Diffs: finds shared nodes with `source: "player"` NOT already in `lore_seed`/`ecology` (0.75 similarity)
4. Emits OpenSpec change under `openspec/changes/<date>-curate-shared-lore/`:
   - `proposal.md` — human-readable candidate list with review guidance
   - `tasks.md` — checklist for curator
   - `design.md` — design rationale
   - `specs/world-rules/spec.md` — formal requirement delta
   - `candidates.lore_seed.json` — paste-ready `lore_seed` entries

**Curator reviews, edits `world.json`, lands PR.** Shared graph unchanged.

---

### Step 12: Canonical Propagation

**Next deploy:** `world.json` → `WORLD_DOC` embed in `index.html` (re-sync) → all players receive new baseline facts on next `pullLore`.

---

## 3. Data Flow Summary

| Stage | Source | Destination | Key Function | Trigger |
|-------|--------|-------------|--------------|---------|
| 1. Generate | LLM | string | `genLore()` | `doAsk`/`doExamine` |
| 2. Local commit | fact | `LORE.nodes` + localStorage | `commitLore()` | `playerTurn` |
| 3. Collect | `LORE.nodes` | payload[] | `collectContributions()` | `autoContribute` |
| 4. Pre-filter | payload[] | clean[] | `validateFactClient()` | `pushLore` |
| 5. POST | clean[] | `/api/lore` | `pushLore()` | `showEnd()` |
| 6. Validate | node | accept/reject | `validateNode()` + `semanticConflict()` | server handler |
| 7. Merge | accepted | Upstash Redis | `writeGraph()` | server handler |
| 8. Bootstrap | Redis | `LORE.nodes` (local) | `pullLore()` | `newGame()` |
| 9. Curate | Redis | OpenSpec change | `curate-lore.mjs` | manual CLI |
| 10. Promote | change | `world.json` (PR) | human edit | curator |
| 11. Propagate | `world.json` | all players | re-embed + `pullLore` | next deploy |

---

## 4. Source Labels & Precedence

| Label | Assigned By | Can Override |
|-------|-------------|--------------|
| `spec` | `seedLore()` (world.json) | Never — baseline |
| `generated` | `genLore`/`genPlace` commit | — |
| `play` | Player actions (examine, journal) | — |
| `shared` | Server (`api/lore.js`) on merge | — |
| `canonical` | Human PR to `world.json` | Highest — wins on conflict |
| `curated` | Added to tags on promotion | — |

**Merge rule (local precedence):** `pullLore` skips any node already in `LORE.nodes` by `id`. Local discoveries always win.

---

## 5. Configuration & Deployment

### Environment Variables (Vercel / Server)

| Variable | Purpose | Required |
|----------|---------|----------|
| `UPSTASH_REDIS_REST_URL` | Redis REST endpoint | Yes (prod) |
| `UPSTASH_REDIS_REST_TOKEN` | Redis auth token | Yes (prod) |
| `OPENROUTER_API_KEY` | LLM for semantic validation + player proxy | Yes (prod) |
| `LORE_VALIDATOR_MODEL` | Validator model (default `openai/gpt-4o-mini`) | No |
| `YORK_LLM_MODEL` | Player interpretation model (default `nvidia/nemotron-3-ultra-550b-a55b:free`) | No |

### Local Development

Without Redis env vars:
- `api/lore.js` falls back to `.cache/shared-lore.json`
- `pushLore`/`pullLore` work against local file
- Semantic validation falls back to keyword heuristic (no LLM key needed)

---

## 6. Testing the Round-Trip

```bash
# 1. Start dev server (serves api/lore.js + index.html)
npm run dev  # or however you run the Vercel dev server

# 2. Play a game, trigger genLore (ask "what lives in the tide pools?")
#    → game over → autoContribute fires

# 3. Verify shared graph
curl http://localhost:3000/api/lore?world=meridian

# 4. Run curator (reads local fallback)
node scripts/curate-lore.mjs meridian

# 5. Review generated change
cat openspec/changes/*/proposal.md
```

---

## 7. Failure Modes & Safeguards

| Failure Point | Behavior |
|---------------|----------|
| LLM gen fails | `genLore` returns null → fallback text logged, no commit |
| `pushLore` network error | Silent fail, local lore intact, retries next session |
| Server validation rejects | Node dropped, rejection reason returned, local copy kept |
| Redis unavailable | Falls back to local JSON file, logic unchanged |
| Semantic check unavailable | Keyword heuristic runs, less precise but safe |
| Curator rejects candidate | Shared graph retains it; canon unchanged |
| Duplicate fact (0.75 Jaccard) | Server dedupes, no double-count |

---

## 8. Key Code References

| File | Function | Line |
|------|----------|------|
| `index.html` | `genLore()` | ~963 |
| `index.html` | `commitLore()` | ~757 |
| `index.html` | `autoContribute()` | ~395 |
| `index.html` | `collectContributions()` | ~328 |
| `index.html` | `pushLore()` | ~350 |
| `index.html` | `pullLore()` | ~364 |
| `index.html` | `validateFactClient()` | ~333 |
| `api/lore.js` | `POST /api/lore` handler | ~236 |
| `api/lore.js` | `validateNode()` | ~120 |
| `api/lore.js` | `semanticConflict()` | ~85 |
| `api/lore.js` | `canonContext()` | ~45 |
| `api/lore.js` | `readGraph`/`writeGraph` | ~188 |
| `api/lore.js` | `similar()` (dedupe) | ~213 |
| `scripts/curate-lore.mjs` | `run()` | ~74 |
| `scripts/curate-lore.mjs` | `similar()` (canon diff) | ~35 |

---

## 9. Future Extensions (Phase 4+)

- **Admin UI** — Visual curation dashboard (this doc's motivation)
- **Learnability pass** — Inject curator report into player prompt
- **Cross-world lore** — Multiple `world_id` support in shared store
- **Lore analytics** — Track which generated facts survive curation
- **Automated smoke test** — CI runs `curate-lore` on PR to catch regressions