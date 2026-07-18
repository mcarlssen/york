# York Play-Test Harness — Design & Spec (rev 2)

**Date:** 2026-07-17
**Status:** Draft — supersedes `2026-07-15-playtest-harness-design.md`
**Supersedes:** [2026-07-15-playtest-harness-design.md](./2026-07-15-playtest-harness-design.md)
**Scope:** A headless harness that drives the Meridian engine with an LLM (or offline)
player, records trajectories, and produces designer feedback aligned to three goals:
**mechanics integrity**, **game-loop quality**, and **world/lore growth**.

---

## 0. Goals (why this exists)

| Goal | Question the harness answers | Primary arms |
|------|------------------------------|--------------|
| **1. Mechanics** | Is anything broken or unexpected? Soft-locks, dead actions, unreachable endings, rejection storms, extract regressions. | `spine` + fixture replay + privileged observe |
| **2. Game loop** | Does the wreck-clock / signal-vs-conceal / craft / companion loop feel navigable and tense? Where do players stall or skip? | `full` + `blind` observe + loop signals |
| **3. World & lore** | Does generation produce usable, on-rules content? Can we harvest candidate facts/places/entities for curation? | `full` + gen recording + harvest export |

Everything below is subordinate to these three. “Fun” is **not** a primary goal; subjective
LLM self-reports are an optional secondary critic pass, labeled as **proxy only**.

---

## 1. Constraints & decisions (locked)

### 1.1 Target & bounds
- **Target game:** Meridian only. Gray Light = future second adapter.
- **Clock bound:** keep `WORLD_DOC.map.max_clock == 16`. No mechanic changes for the harness
  except the **map-growth trigger** in §4 (required so goal 3 is testable).
- **Extract engine, don’t rewrite rules.** Phase 0 separates pure logic from view/UI/network.

### 1.2 Engine truth (verified 2026-07-17 against `index.html`, ~1246 lines)
- Single-file engine welded to DOM/render; lore via `LoreGraph`; LLM via `callLLMProxy` →
  `API_BASE+"/llm"` (not a DOM key field). Offline spine is `offlineParse` (`ACTION_VERB`
  map was deleted).
- **Action schema** (13 verbs): `look | examine | go | take | salvage | use | build | signal |
  tame | launch | ask | eat | wait`. (Harness adds `discover` — see §4.)
- **`pendingGen` types in live code:**
  - `lore` — from `doExamine` (non-item) and `doAsk` → `genLore` → `{answer,facts,entities}`
    + `applyEntities` may mutate `WORLD.items` / location items.
  - `emerge` — from unmatched `doUse` → `genEmergent` → may apply `lifeDelta` / `consumeItem`.
  - `place` — handled in `runPendingGen` / `genPlace` / `validateNewPlace`, but **nothing
    currently emits `pendingGen:{type:"place"}`**. Dead path. Must be wired (§4) before
    claiming map-growth coverage.
- **Spine determinism:** pure action sequences with gen disabled are deterministic (no
  `Math.random` in engine logic). **With gen enabled, runs are non-deterministic** — balance
  stats must not be mixed with spine stats.

### 1.3 Models & API
- **Default player/critic model:** `nvidia/nemotron-3-ultra-550b-a55b:free` (configurable;
  align with `YORK_LLM_MODEL` when set).
- **Key:** `OPENROUTER_API_KEY` from repo `.env`.
- **LLM transport (preference order):**
  1. `POST ${API_BASE}/llm` when a local/deployed server is up (parity with browser path).
  2. Else direct OpenRouter `https://openrouter.ai/api/v1/chat/completions` with
     `HTTP-Referer: http://localhost`.
- Both paths must pin the same model id and log `transport: "proxy"|"direct"`.

### 1.4 Measurement arms (replaces “full only”)
The 2026-07-15 spec forbade spine-only. That made mechanics results uninterpretable.
**Rev 2 requires multiple arms:**

| Arm | Gen | Observe | Purpose |
|-----|-----|---------|---------|
| `spine` | `genStep` stubbed / skipped; pendingGen recorded as `skipped` | `privileged` | Goal 1 — engine bugs vs LLM noise |
| `full` | lore + emerge + place all live | `privileged` (default) or `blind` | Goals 2–3 |
| `blind` | same as `full` | prose-only observation | Goal 2 — “can you play from what a human sees?” |

Default loop mix (configurable): **`RUNS_SPINE: 10`, `RUNS_FULL: 20`, `RUNS_BLIND: 5`**.
Reports always stratify by arm; never pool endings across `spine` and `full`.

### 1.5 Out of scope (MVP)
- Shared-tier `pullLore` / `pushLore` / Redis round-trip (Phase 4).
- Gray Light adapter.
- Auto-promoting harvested lore into canonical `openspec/world/` (harvest → OpenSpec curator
  flow only; humans still promote).

---

## 2. Success criteria (harness done when…)

1. **Fixture replay (no LLM):** checked-in sequences assert expected mid-state and/or ending;
   CI-smokeable. At least one fixture ends in a known `endKind`.
2. **Spine arm:** ≥1 batch with `genCalls == 0` (except skipped markers), produces mechanics
   section with rejection hotlist + ending reachability flags.
3. **Full arm:** a smoke script forces `discover` + `ask` so `place` and `lore` gen both fire;
   harvest JSON written when any candidates are accepted.
4. **Blind arm:** ≥1 batch; report contrasts mechanic-comprehension privileged vs blind.
5. **Browser still plays** after Phase 0 (manual check: look, ask→lore, discover→place, use→emerge).
6. `node scripts/test-shared-lore.mjs` stays green (untouched).

---

## 3. Architecture

### 3.1 Phase 0 — Engine extraction (`src/engine.js`)
Extract from `index.html` into an importable module shared by browser and Node.

**Include (sync core):**
`WORLD_DOC`, `buildWorld`, `WORLD`, `SPEC`, `ENDINGS`, `LoreGraph`, `seedLore`,
`applyAction` and all `do*` verbs (including new `doDiscover`), `tick` / meter helpers,
`checkEnd` / `endGame`, `commitLore`, `validateNewPlace`, `validateFactClient`,
`applyEntities`, `registerItem`, `normalizeDir`, `describe`, `offlineParse`,
`flattenActions` / `normalizeParsed`.

**Include (async gen, injectable):**
`genLore`, `genEmergent`, `genPlace`, `runPendingGen` (or harness-facing `genStep`),
`llmText` / proxy caller — **injected** via `createGame({ llm })` so Node and browser supply
transport without `document` / hard-coded `fetch` to UI.

**Strip / guard:**
`render`, UI handlers, `localStorage` (Node: in-memory store behind `storage` adapter),
`window`, toast/thinking DOM, shared-tier network (`pullLore`/`pushLore`/`contribute`) —
left in thin `index.html` / `api/*` for MVP.

**Boundary rule:** `applyAction` stays **synchronous** and returns `{ok,text,cls,ended?,
pendingGen?, lore?}`. All LLM I/O happens in `genStep(pendingGen)` (async). Harness and
browser both: `act` → if `pendingGen` → `await genStep`.

**Verification:** fixture replay + open `index.html` and exercise lore / place / emerge.

### 3.2 Adapter contract

```js
// src/engine.js
export function createGame(opts = {}) {
  // opts: { llm, storage, seedLoreGraph?, arm? }
  return {
    reset(opts?),           // newGame; loads seed lore graph or empty+seedLore(WORLD_DOC)
    observe(mode?),         // "privileged" | "blind" — see §3.3
    act(action),            // sync; returns result incl. pendingGen?
    genStep(pendingGen),    // async; lore | emerge | place
    isOver(),
    ending(),               // endKind | null
    metrics(),              // {life,wreck,signal,warmth,clock,turns,score?}
    loreStats(),            // {nodes, retrieved, generated, entitiesAdded, placesAdded}
    dumpHarvest(),          // candidate lore/places/entities since reset (§7)
    exportState(),          // debug / fixture capture
  };
}
```

`genStep` return shape (all types):
```js
{
  kind: "gen",
  type: "lore" | "emerge" | "place",
  ok: boolean,
  verdict: "accepted" | "rejected" | "unavailable" | "skipped",
  why?: string,
  // type-specific:
  answer?, facts?, entities?,     // lore
  text?, lifeDelta?, consumeItem?, // emerge
  place?, exitKey?,               // place
  raw?: string
}
```

On arm `spine`, `genStep` does not call the LLM; returns `{verdict:"skipped"}` and does not
mutate world/state.

### 3.3 Observation modes

**`privileged`** (mechanics / fast play):
```js
{
  place, desc,
  exits: ["north", ...],
  itemsHere: [...],
  inventory: [...],
  meters: { life, wreck, signal, warmth, clock, maxClock },
  flags: { /* craft/shelter/pyre/... */ },
  tame: { cat, parrot },
  log: [{t,c}, ...]   // last K Keeper lines
}
```
Do **not** inject full map topology into the system prompt. At most: current place name +
exits from `observe()`. Goal 3 exploration must not be short-circuited by a god-map.

**`blind`** (game-loop / human-fidelity):
```js
{
  text: <describe()-equivalent prose>,
  log: [{t,c}, ...],
  meters: { life, wreck, signal, warmth, clock, maxClock }  // meters stay visible; UI shows them
}
```
No exit list, item list, flags, or tame numbers beyond what `text`/`log` already said.

### 3.4 Prompt contract versioning
Every run records:
```js
promptVersion: "<hash of system prompt template + observe schema id>"
observeMode, arm, model, transport
```
Reports refuse to trend-compare runs with mismatched `promptVersion` without an explicit
override flag.

---

## 4. Map-growth trigger (engine change, in scope)

**Problem:** `genPlace` is unreachable; goal 3 cannot measure or harvest map growth.

**Decision — add action `discover`:**
- Schema: `{ action: "discover", target?: string, say?: string }`.
- `doDiscover(t)` returns
  `{ ok:true, text:"You search for a way onward…", pendingGen:{ type:"place", query: t||say||"What lies near here?" } }`.
- Offline parse: phrases like `discover`, `explore beyond`, `find a new place`, `scout for a path`
  → `discover`.
- Browser LLM schema string updated to include `discover`.
- `validateNewPlace` unchanged; rejections remain first-class signals.

Existing `ask`/`examine` → `lore` and `use` → `emerge` stay as-is.

---

## 5. Harness components (`harness/`)

All `.mjs`, Node 18+, native `fetch`. Optional: talk to local `/api/llm` if `API_BASE` set.

### 5.1 `harness/config.mjs`
```js
{
  OPENROUTER_API_KEY,
  API_BASE: null | "http://localhost:3000/api",  // if set, prefer proxy
  PLAYER_MODEL: "nvidia/nemotron-3-ultra-550b-a55b:free",
  CRITIC_MODEL: "nvidia/nemotron-3-ultra-550b-a55b:free",
  RUNS_SPINE: 10,
  RUNS_FULL: 20,
  RUNS_BLIND: 5,
  MAX_TURNS: 200,                 // safety vs runaway; distinct from clock 16
  MAX_TOKENS_PER_LOOP: 2_000_000, // hard stop; also stop on consecutive rate-limits
  MAX_GEN_PER_RUN: 40,            // cap gen spam (ask-every-turn)
  TEMPERATURE: 0.7,
  RECORD_DIR: "harness/runs",
  REPORT_DIR: "harness/reports",
  HARVEST_DIR: "harness/harvest",
  LEARNABILITY_PASS: false,
  CRITIC_ENABLED: false           // off by default; proxy-only when on
}
```
**Remove:** meaningless `SEED` unless/until an RNG exists. Reproducibility for spine =
fixture action files; for full = model id + temperature + promptVersion (best-effort).

### 5.2 `harness/player.mjs`
- `buildSystemPrompt({ arm, observeMode, worldMeta })` — identity + constraints + **action
  schema including `discover`** + win/lose summary. Invite exploration on `full`/`blind`.
  No full map dump.
- `decideAction(observation, history)` — one OpenRouter/proxy call; expect JSON action;
  retry once on malformed JSON.
- Failure taxonomy (do not collapse into one counter):
  - `parse_fail` — bad JSON after retry → emit `{action:"look"}`
  - `rate_limit` — 429 after backoff → pause / mark run `degraded`; do not silently look-spam
    an entire trajectory without flagging
  - `transport_fail` — network/5xx
  - `empty` — empty model body

### 5.3 `harness/player-offline.mjs`
Port of `offlineParse`. Arm-agnostic baseline. `BASELINE: "offline"|"llm"`. Separates
“engine broken” from “LLM confused.”

### 5.4 `harness/run.mjs`
`runGame({ arm, observeMode, config })`:
1. `createGame({ llm, storage: memory }).reset({ seedLoreGraph: freshSeed() })` —
   **each run starts from `seedLore(WORLD_DOC)` only**; no cross-run LoreGraph persistence.
2. Loop: `observe` → `decideAction` → `act` → if `pendingGen` and arm≠spine → `genStep`
   (respect `MAX_GEN_PER_RUN`); else record skipped.
3. Stop: `isOver()` | `turns >= MAX_TURNS` | budget / consecutive rate-limit abort.
4. Persist `harness/runs/<id>.json` + update `manifest.json`.

Run object:
```js
{
  id, arm, observeMode, promptVersion, model, transport,
  startedAt, ending,   // endKind | "turn_cap" | "budget_abort" | "rate_limit_abort"
  metrics, turns, trajectory,  // action steps + gen steps interleaved
  loreStats,
  failures: { parse_fail, rate_limit, transport_fail, empty, engine_reject },
  genCalls, genRejections, genSkipped,
  harvestRef,          // path into harness/harvest/
  selfReport?: null
}
```

### 5.5 `harness/fixtures/`
Checked-in JSON action sequences (no LLM) for Phase 0 regression:
- `survive-salvage-path.json` — salvage + basic navigation
- `ending-raft.json` / `ending-signal.json` (as soon as a known path exists)
Replay: `node harness/replay.mjs <fixture>`.

### 5.6 `harness/analyze.mjs` — three goal-aligned signal groups

Stratify every metric by `arm` (+ `observeMode` where relevant).

**A. Mechanics integrity (goal 1)** — primarily `spine` (+ fixture diffs):
- Engine-rejection hotlist (action×reason).
- Dead actions (never taken or always rejected).
- `turn_cap` / soft-lock heuristics (repeat same rejected action ≥N; wait-only loops).
- Ending reachability: **scripted path proofs** (fixtures) first; optional BFS later.
  Do not claim formal reachability without a declared algorithm.
- Extract/fixture regressions: replay must match expected ending + key flags.

**B. Game-loop quality (goal 2)** — `full` + `blind`:
- Ending distribution **within arm**; avg turns; death clock clustering.
- Mechanic touch rates: salvaged cargo count; craft built; pyre+signal; tame cat/parrot;
  felt wreck pressure (salvage before late clock).
- Decision density: distinct action types per run; time-to-first-salvage / first-build.
- Blind vs privileged gap on the same mechanic-touch booleans → “UI/prose affordance” debt.
- Difficulty flags (tunable): e.g. `perish > 80%` on full+privileged; ending `< 5%` among
  finished runs — **advisory**, not auto-truth.

**C. World & lore growth (goal 3)** — `full` / `blind` only:
- Lore: accept/reject rates; contradiction list from `validateFactClient` / semantic checks;
  duplicate/echo detection; entity spawn counts (`applyEntities`).
- Place: `% runs with ≥1 place accept`; rejection reasons from `validateNewPlace`.
- Emerge: count, mean `lifeDelta`, consume events — **flag emerge as semi-trusted LLM
  mutation** in the report (architecture tension with “engine owns truth”).
- LoreGraph recall: sample later turns; did generated node text appear in `LORE.retrieve`?
- **Harvest:** write de-duped candidates for curator intake (§7).

### 5.7 `harness/critic.mjs` (optional, `CRITIC_ENABLED`)
Two passes, labeled **proxy — not human fun**:
1. Per-run self-report (goal confusion, stall points).
2. Batch review on sampled transcripts + quantitative metrics.

Never title the section “Fun.” Use “Player-proxy notes.”

### 5.8 `harness/report.mjs`
`harness/reports/<ts>/report.md` + `metrics.json`.
Structure:
1. Executive: goal 1 / 2 / 3 one-liners
2. Mechanics (spine)
3. Game loop (full vs blind)
4. World & lore + link to harvest
5. Player-proxy notes (if enabled)
6. Manifest + promptVersion

### 5.9 `harness/loop.mjs`
```
fixtures replay (fail → abort)
→ spine runs → full runs → blind runs
→ analyze → optional critic → report + harvest
```
Single entry: `node harness/loop.mjs`.

---

## 6. Data flow

```
loop.mjs
  ├─ replay.mjs (fixtures) ─────────────────────────────► gate
  ├─ for arm in [spine, full, blind]:
  │     run.mjs → createGame → [observe→player→act→genStep?]×N → runs/<id>.json
  ├─ analyze.mjs → signals stratified by arm
  ├─ critic.mjs? → proxy notes
  └─ report.mjs + harvest/*.json
```

---

## 7. Harvest export (goal 3 deliverable)

Each full/blind run appends candidates to `harness/harvest/<batchId>.json`:
```js
{
  batchId, promptVersion, model,
  candidates: [
    { kind:"fact"|"place"|"entity"|"emerge_lore", text, meta, runId, verdict, tags }
  ]
}
```
Accepted, on-rules, non-duplicate facts/places are the feedstock for the existing OpenSpec
curator flow (`curate-shared-lore` / shared → canonical). Harness **proposes**; humans
**promote**. No auto-write to `openspec/world/`.

---

## 8. Error handling

| Event | Behavior |
|-------|----------|
| Malformed player JSON | retry once → `look` + `parse_fail` |
| Rate limit | backoff once; if still failing, `rate_limit_abort` end run (do not fill with looks) |
| Gen fail / no key | `verdict:"unavailable"`; run continues; counted in world-evolution |
| Engine `{ok:false}` | `engine_reject`; continue |
| `MAX_TURNS` | `ending:"turn_cap"` |
| Token budget | stop scheduling new runs; finish in-flight; report partial |
| No API key + llm baseline | exit with message pointing at `.env` (offline baseline still works) |

---

## 9. Testing / verification

- Phase 0: fixture replay green; browser play incl. `discover` → place, `ask` → lore,
  unmatched `use` → emerge.
- `node harness/run.mjs --arm spine` → valid ending, `genCalls` skipped only.
- `node harness/run.mjs --arm full` → ≥0 place attempts when player discovers; harvest non-empty
  if any accepts.
- `node harness/loop.mjs` with small run counts → report with three goal sections.
- Shared-lore script untouched and green.

---

## 10. Phasing

| Phase | Work |
|-------|------|
| **0a** | Wire `discover` → `pendingGen place` in `index.html` (or during extract). Update offline + LLM schema strings. Manual browser check. |
| **0b** | Extract `src/engine.js` + thin `index.html`; storage/llm injection; Node boot. Fixture replay. |
| **1** | Harness skeleton: config, player, offline player, run (arms + observe modes), logging, failure taxonomy. |
| **2** | analyze (three goal groups) + harvest export. |
| **3** | report + loop + budget caps; optional critic. |
| **4** | Shared-tier round-trip; learnability pass; Gray Light; trend UI across promptVersions. |

---

## 11. Open items (explicitly deferred)

- Semantic lore validator model choice in headless (reuse server validator vs local heuristic).
- Whether `emerge` should be tightened (engine-owned outcome table) — product decision; harness
  only **surfaces** the trust gap until then.
- Exact difficulty thresholds (80% / 5%) — tune after first real batch.
- Local vs deployed `API_BASE` for `/api/llm` (implemented in `api/lore.js`) — harness
  prefers proxy when `API_BASE` is set, else direct OpenRouter.

---

## 12. Changelog from 2026-07-15

- Goals reframed: mechanics / game loop / world-lore (not “five signals + fun”).
- Multi-arm measurement (`spine` / `full` / `blind`); stratified reporting.
- Fixed dead `place` path via `discover` action.
- Adapter covers `lore` | `emerge` | `place` and structured genLore + entities.
- Determinism claim scoped to spine only.
- Observation: no god-map prompt; privileged vs blind.
- Run isolation: fresh seed lore per run.
- Failure taxonomy; rate-limit abort; token/gen budgets.
- Removed bogus `SEED`; added fixtures + promptVersion.
- Critic demoted to optional proxy notes.
- Harvest export for curator intake.
- Engine facts refreshed (line count, ACTION_VERB removal, `/llm` proxy).
