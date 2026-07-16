# York Play-Test Harness — Design & Spec

**Date:** 2026-07-15
**Status:** Approved design → implementation plan pending
**Scope:** A headless harness that drives the Meridian engine with an LLM "player,"
records full run trajectories, and produces a feedback report across five signal
classes — balance/outcomes, mechanic comprehension, broken-path detection, fun/narrative,
**and world-evolution (lore-generation + map growth)**. The latter is a primary purpose:
the harness must exercise, not bypass, the lore-generation and world-evolution mechanic.

---

## 1. Constraints & decisions (locked)

- **Target game:** Meridian only. Gray Light remains as a future second adapter.
- **Engine state (verified on disk):**
  - Engine lives in `index.html` (single ~998-line file), welded to DOM/render/network.
    No `src/engine.js`, no `import`/`export`. Must be extracted (Phase 0).
  - `WORLD_DOC.map.max_clock == 16` (`index.html:170`). `checkEnd()` force-ends the game
    when `S.clock >= WORLD.maxClock` (`index.html:702`). This is the **clock bound**.
  - The engine is deterministic per action sequence (no `Math.random` in engine logic),
    so balance/bug analysis is a clean function of play strategy.
- **Decision — keep the 16-clock bound.** No change to game mechanics. The harness "persists
  until completion/win/lose," and the engine's own end conditions (life/warmth/wreck/clock)
  already terminate every run, so the loop terminates naturally.
- **Decision — extract engine, do not change rules.** Phase 0 separates pure logic from view.
- **Player model:** `nvidia/nemotron-3-ultra-550b-a55b:free` via OpenRouter (the free slug the
  game already uses). Configurable later. Critic model defaults to the same, configurable.
- **API key:** read from `/Users/mike/github/york/.env` (`OPENROUTER_API_KEY`), already present.
- **OpenRouter endpoint:** `https://openrouter.ai/api/v1/chat/completions`, `HTTP-Referer: http://localhost`.
- **Primary purpose — world-evolution:** the harness's DEFAULT and ONLY mode is **`full`**: the
  headless engine includes the lore-generation + map-growth mechanic (`genLore`, `genPlace`,
  `validateNewPlace`, `LoreGraph`, `commitLore`, `LORE.retrieve`), and the player LLM is free to
  emit `ask`/`examine`/discovery intents that trigger generation. There is no "spine-only" branch
  that bypasses it. Generation calls, their validation verdicts, and LoreGraph recall are recorded
  as first-class trajectory steps and analyzed as the world-evolution signal.

---

## 2. Goals

1. Let an LLM play Meridian end-to-end, headlessly, many times.
2. Record every run as a full observable trajectory (state + action + result + log + generated lore).
3. Analyze runs to produce five feedback signals for the designer (Mike), including world-evolution.
4. Provide a repeatable loop: run → analyze → report, re-runnable as the game evolves.

---

## 3. Architecture

### 3.1 Engine extraction (Phase 0) — `src/engine.js`
Extract the full deterministic engine from `index.html`, **including the lore-generation and
map-growth mechanic** (this is a primary purpose of the harness):
- `WORLD_DOC`, `buildWorld`, `WORLD`, `SPEC`, `ENDINGS`.
- `LoreGraph` (in-memory; `localStorage` guarded/no-op in Node), `seedLore`, `LORE.retrieve`.
- All engine functions: `newGame`, `node`, `dirToNode`, `canTravel`, `hasItem`, `itemName`,
  `normalizeDir`, `applyAction`, `tick`, `lifeDelta`/`warmthDelta`/`signalDelta`/`tameDelta`,
  `describe`, `doExamine`/`doGo`/`doTake`/`doSalvage`/`ageWreck`/`doUse`/`doAsk`/`doBuild`/
  `doSignal`/`doTame`/`doLaunch`/`doEat`/`doWait`, `checkEnd`, `endGame`, `commitLore`.
- **Lore-generation subsystem (kept in headless engine):**
  - `genLore(text)` — generates a single world fact answering a query; must run headless
    (OpenRouter call stays, but key reads from `config`/env, not `document.getElementById`).
  - `genPlace(query)` + `validateNewPlace(prop)` — proposes + validates a new map node.
  - The `playerTurn` lore-hook (`res.pendingGen.type === "lore"|"place"`) is re-exposed as an
    engine step so the headless loop can fire generation and record it (see §3.2 `genStep`).
- Strip: `render`, all `document.*` for UI, `pullLore`/`pushLore`/`contribute` (shared-tier
  network — see Phase 4), `callLLM`/`offlineParse` (the browser NL parser; the harness uses the
  raw action schema + its own `player.mjs` LLM call instead), UI event handlers, `window` scrolling.
- Guard: `localStorage`, `document`, `window` access must be no-ops/guarded in Node.

`src/engine.js` exposes a thin factory (the **adapter contract**, §3.2) and is importable in
both the browser (`<script type="module">`) and Node (`.mjs`).

### 3.2 Adapter contract
All harness/engine interaction goes through one interface so Gray Light drops in later:

```js
// src/engine.js
export function createGame() {
  return {
    reset(),                                  // newGame()
    observe(),                                // -> structured observation (§3.3)
    act(action),                              // action: {action,target?,item?,say?}
                                               //    returns {ok,text,cls,ended,ending,
                                               //             pendingGen?}  // lore/place hook
    genStep(pendingGen),                      // runs genLore/genPlace, validates, commits;
                                               //    returns {type, fact?, place?, verdict, rejected?}
    isOver(),                                 // S.ended
    ending(),                                 // S.endKind
    metrics(),                                // {life,wreck,signal,warmth,clock,turns,score}
    loreStats()                               // {nodes, retrieved:count, generated:count}
  };
}
```

### 3.3 `observe()` shape (fed to the player LLM each turn)
```js
{
  place, desc,
  exits: [ "north", ... ],
  itemsHere: [ ... ],
  inventory: [ ... ],
  meters: { life, wreck, signal, warmth, clock, maxClock },
  flags: { raftBuilt, pyreBuilt, shelterBuilt, balloonBuilt, ... },
  tame: { cat, parrot },
  suggestions: [ ... ],          // optional hints from engine
  log: [ {t, c}, ... ]           // recent Keeper's Log lines
}
```

### 3.4 Scope notes
- **Lore-generation IS in scope** (primary purpose). The headless engine keeps `genLore`,
  `genPlace`, `validateNewPlace`, `LoreGraph`, `commitLore`, `LORE.retrieve`. The harness player
  drives the **engine action schema directly** (see §4) — one player-LLM call per turn — and
  when an action returns `pendingGen`, the loop calls `genStep()` and records the result as a
  first-class trajectory step. This is how the harness exercises, rather than bypasses,
  lore-gen and world-evolution.
- **Shared-tier network (`pullLore`/`pushLore`/shared KV) is out of scope for MVP** (left in
  `index.html`/server). The within-session LoreGraph (`LORE.retrieve` recall) is in scope and is
  the cheaper, testable half of "world-evolution." The cross-session shared round-trip is a
  Phase 4 extension (see §9).
- `callLLM`/`offlineParse` (the browser NL parser) are NOT reused; `player.mjs` makes its own
  OpenRouter call. `pushLore`/`pullLore`/`contribute`/UI are stripped.

---

## 4. Harness components (`harness/`)

All `.mjs`, ES modules, run under Node 18+ with no deps (native `fetch`).

### 4.1 `harness/config.mjs`
Reads `.env` (`OPENROUTER_API_KEY`). Exports:
```js
{
  OPENROUTER_API_KEY,
  PLAYER_MODEL: "nvidia/nemotron-3-ultra-550b-a55b:free",
  CRITIC_MODEL: "nvidia/nemotron-3-ultra-550b-a55b:free",
  RUNS: 30,
  MAX_TURNS: 200,            // safety cap distinct from engine clock (anti-runaway)
  SEED: null,                // optional, for reproducibility
  BASE_URL: "https://openrouter.ai/api/v1/chat/completions",
  RECORD_DIR: "harness/runs",
  REPORT_DIR: "harness/reports"
}
```

### 4.2 `harness/player.mjs`
- `buildSystemPrompt(world)` — encodes identity (`WORLD_DOC.identity`), `constraints`, a map
  summary (node names + exits, NOT full descriptions), the action schema (the 14 verbs in
  `ACTION_VERB`), win/lose conditions, the rule that the engine owns truth, and an explicit
  invitation to **explore the world** — `ask`/`examine` freely to learn lore, since generation
  is part of the test. (The player drives the raw action schema; `genLore`/`genPlace` fire
  automatically when the engine returns `pendingGen`.)
- `decideAction(observation, history)` — calls OpenRouter with `max_tokens:200`, temperature
  moderate; expects JSON matching the action schema. Retries once on malformed JSON; on second
  failure, emits an explicit `{action:"look"}` so the run never dies on a parse error.
- Returns the parsed action object + raw model output + token/usage (for failure accounting).

### 4.3 `harness/run.mjs`
`runGame(config)`:
1. `createGame().reset()`.
2. Loop:
   - `observe()` → `decideAction()` → `act(action)`.
   - If `result.pendingGen` is set, call `genStep(result.pendingGen)` and append a
     **generation step** `{kind:"gen", type, fact?, place?, verdict, rejected?, raw}`.
   - Append the action step `{obs, action, result, raw, usedLLM, parsedOk}`.
   - Stop when `isOver()` OR `turns >= MAX_TURNS`.
3. Return run object:
```js
{
  id, model, startedAt,
  ending,                 // endKind or "turn_cap"
  metrics,                // final metrics
  turns,
  trajectory: [ ... ],    // full step list (action + generation steps interleaved)
  loreStats,              // from engine.loreStats()
  parseFailures,          // count of malformed-model responses
  engineRejections,       // count of {ok:false} results
  genCalls,               // count of genLore + genPlace invocations
  genRejections,          // count rejected by validateNewPlace / validateFactClient / semantic
  selfReport              // filled later by critic (§4.6)
}
```
Saves to `harness/runs/<id>.json` (and a `manifest.json` index).

### 4.4 `harness/player-offline.mjs` (optional baseline)
Node port of `offlineParse` for a deterministic, key-free baseline player (keyword parser).
Toggle via `config.BASELINE = "offline"|"llm"`. Useful to separate "engine is broken" from
"player LLM is confused."

### 4.5 `harness/analyze.mjs`
Aggregates all runs in a `manifest` into the **five** signals:

- **Balance & outcomes:** win/loss rate (win = non-`perish`), ending distribution (5 endings +
  `turn_cap`), avg turns, avg final meters, death-point clustering (which clock value / which
  action the run died on), difficulty flags (`perish` > 80% = too punishing; any ending < 5% =
  near-unreachable).
- **Mechanic comprehension:** per-run booleans — salvaged all 5 cargo; built a craft
  (raft/balloon); built pyre + signaled; tamed cat; tamed parrot; reached rescue via
  signal≥8 + (radio|parrot); felt wreck-clock pressure (salvaged before clock late). Plus
  engine-rejection rate and parse-failure rate.
- **Broken-path detection:** actions never taken across all runs (dead actions); static
  reachability check for each ending (is the path satisfiable from start given engine rules —
  flag unreachable); `turn_cap` count (soft-lock / runaway); exploit scan (e.g. `wait`-only
  loops that avoid death); engine-rejection hotlist (which actions are most rejected).
- **World-evolution (PRIMARY):** the lore-generation + map-growth mechanic, measured from the
  generation steps and `loreStats`:
  - **Coherence:** % of `genLore` facts that pass `validateFactClient`/semantic check; list of
    any contradictions produced (these are direct "broken" signals — the world generated
    something that breaks its own rules).
  - **Map growth:** % of runs where `genPlace` fires; count of nodes added; count + reasons of
    `validateNewPlace` rejections (the "rule forbids it" verdict is itself a balance finding).
  - **LoreGraph recall:** does `LORE.retrieve` actually surface generated facts in later
    prompts (or is generated lore dead memory)? Measured by sampling later `observe()` contexts
    and checking whether generated node text appears in the retrieved set.
  - **Generation load:** `genCalls` and `genRejections` per run — budget impact on `RUNS`,
    and whether generation stalls play (does the player keep asking when nothing new appears?).
  - **Quality flags:** duplicate/near-duplicate generated facts; facts that merely echo existing
    lore; off-tone or non-narrative outputs.
- **Fun & narrative:** aggregates self-reports + critic review (§4.6), including the critic's
  read on whether world-evolution *enhanced* the experience or added noise.

### 4.6 `harness/critic.mjs`
Two LLM passes (each one OpenRouter call), using `CRITIC_MODEL`:
1. **Per-run self-report** — fed the run trajectory + ending, asks the player persona to state
   its goal, what felt fun/tense, what confused it. Stored on the run (`selfReport`).
2. **Critic review** — fed N sampled transcripts + the quantitative metrics, writes a narrative
   review: does the wreck-clock → signal-vs-conceal loop feel meaningful, decision density,
   confusion points, lore coherence, concrete "what might be broken" notes.

### 4.7 `harness/report.mjs`
Writes `harness/reports/<ts>/report.md` (human-readable, all five signals, world-evolution
prominent) and `metrics.json` (machine-readable, for trend tracking across loop iterations).

### 4.8 `harness/loop.mjs`
Orchestrates: `run all games` → `analyze` → `critic` → `report`, then prints the report path.
Single command: `node harness/loop.mjs`. Optional **learnability pass** (later toggle): inject
the prior report's lessons into the player system prompt and re-run, to measure comprehension
gain. MVP ships without it; flag in config as `LEARNABILITY_PASS: false`.

---

## 5. Rewired `index.html` (thin view)
After extraction, `index.html` becomes:
- `<script type="module">` importing `src/engine.js` `createGame`.
- Keeps `render`, `playerTurn` (browser NL path using `callLLM`/`offlineParse`), `genLore`,
  `genPlace`, shared-lore network (`pullLore`/`pushLore`/`contribute`), all UI handlers.
- Engine calls go through the same `createGame()` factory the harness uses.
Game must still play in-browser after the refactor (verification step).

---

## 6. Data flow

```
loop.mjs
  └─ for i in RUNS: run.mjs → createGame() → [observe→player.mjs→act→genStep?]×N → save run.json
  └─ analyze.mjs → aggregate(runs) → signals
  └─ critic.mjs  → selfReports + review
  └─ report.mjs  → reports/<ts>/report.md + metrics.json
```

---

## 7. Error handling
- **Model call fails** (network/non-200): retry once, then fall back to `{action:"look"}` and
  log a `parseFailure`. Run never aborts on model error.
- **Engine reject** (`{ok:false}`): recorded as `engineRejection`, not a crash; run continues.
- **Runaway** (model loops without ending): `MAX_TURNS` hard cap → `ending:"turn_cap"`.
- **No API key:** harness exits with a clear message pointing to `.env`.
- **Lore-gen call fails** (network/non-200, or no key): `genStep` records
  `{verdict:"unavailable", rejected:true}` and the engine's existing fallback text is logged;
  the run continues. Generation failures are surfaced in the world-evolution signal, not hidden.

---

## 8. Testing / verification
- After Phase 0: open `index.html` and confirm the game still plays (manual, in-browser),
  including an `ask` that triggers `genLore`.
- `node harness/run.mjs` runs a single game to a valid ending, with generation steps recorded
  when the player `ask`s/`examine`s.
- `node harness/loop.mjs` with `RUNS:3` produces a report referencing real runs, including the
  world-evolution section.
- Existing `node scripts/test-shared-lore.mjs` stays green (untouched).

---

## 9. Phasing
- **Phase 0** — Extract `src/engine.js` **including the lore-gen + map-growth subsystem** +
  rewire `index.html` to thin view. Verify in-browser (incl. a `genLore` trigger).
- **Phase 1** — Harness skeleton: `config.mjs`, `player.mjs` (explore-inviting prompt),
  `run.mjs` (with `pendingGen` → `genStep` recording), run logging.
- **Phase 2** — `analyze.mjs` (**5 signals, world-evolution first-class**) + `critic.mjs`
  (self-report + review).
- **Phase 3** — `report.mjs` + `loop.mjs` + optional baseline (`player-offline.mjs`).
- **Phase 4 (later, not MVP)** — Shared-tier round-trip coverage (point `API_BASE` at a
  deployed/localfallback `api/lore.js`; verify push→merge→bootstrap), learnability pass,
  Gray Light adapter, report trend tracking.

---

## 10. Open items (resolved by decisions above)
- Target game: Meridian (engine present at root `index.html`; current branch `poc/lighthouse-nl`). ✓
- Turn bound: keep 16-clock. ✓
- Player model: `nvidia/nemotron-3-ultra-550b-a55b:free`. ✓
- Mode: `full` only — lore-gen + world-evolution always exercised; no spine-only branch. ✓
- Run count / budget: default `RUNS:30`, adjustable in config. (Mike to tune per cost;
  note `genLore`/`genPlace` add OpenRouter calls beyond the per-turn player call.)
