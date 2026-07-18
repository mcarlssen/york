# Play-Test Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a headless Meridian play-test harness that exercises mechanics (`spine`), game loop (`full`/`blind`), and world/lore growth (gen + harvest), per [2026-07-17-playtest-harness-design.md](../specs/2026-07-17-playtest-harness-design.md).

**Architecture:** Extract the deterministic engine into `src/engine.js` behind `createGame()` (sync `act`, async `genStep`). Harness `.mjs` modules drive arms (`spine`/`full`/`blind`), record trajectories, analyze three goal groups, and export harvest JSON. Browser keeps a thin `index.html` view over the same factory.

**Tech Stack:** Node 18+ ESM, native `fetch`, no new npm deps. Tests = `node --test` or assert scripts (match `scripts/test-shared-lore.mjs`). LLM via `/api/llm` proxy or direct OpenRouter.

## Global Constraints

- Meridian only; clock bound stays 16; no rule rewrites except `discover` → `pendingGen place`.
- Arms stratified; never pool `spine` and `full` endings.
- Fresh `seedLore(WORLD_DOC)` per run; no cross-run LoreGraph persistence in harness.
- No god-map in player prompts; observe modes `privileged` | `blind`.
- Phase 4 (shared-tier, Gray Light, learnability) out of scope.
- Do not break `node scripts/test-shared-lore.mjs`.
- Commit after each task.

## File structure

| Path | Responsibility |
|------|----------------|
| `src/engine.js` | World doc, LoreGraph, verbs, gen, `createGame()` |
| `index.html` | UI + shared-lore network; imports `createGame` |
| `harness/config.mjs` | Env + run budgets |
| `harness/llm.mjs` | Proxy/direct transport |
| `harness/player.mjs` | LLM player + promptVersion |
| `harness/player-offline.mjs` | Offline parse player |
| `harness/run.mjs` | Single-run loop |
| `harness/replay.mjs` | Fixture replay CLI |
| `harness/analyze.mjs` | Three goal signal groups |
| `harness/harvest.mjs` | Candidate de-dupe export |
| `harness/report.mjs` | `report.md` + `metrics.json` |
| `harness/critic.mjs` | Optional proxy notes |
| `harness/loop.mjs` | Orchestrator |
| `harness/fixtures/*.json` | Action sequences |
| `harness/tests/*.mjs` | Node tests |
| `harness/runs/`, `reports/`, `harvest/` | Output dirs (+ `.gitignore`) |

---

### Task 1: Wire `discover` → place generation

**Files:**
- Modify: `index.html` (`applyAction`, new `doDiscover`, `offlineParse`, `callLLM` schema string)
- Test: `harness/tests/test-discover.mjs` (temporary: will import engine after Task 2; for Task 1 use a minimal inline check via jsdom-free approach — **skip browser automation**; verify with Node after extract. For this task: unit-test only after extracting the verb into a tiny probe, OR defer automated test to Task 2 and verify manually.)

**Pragmatic approach for Task 1:** Add `discover` in `index.html` now; automated test lands in Task 2 once `createGame` exists. Manual verification steps included.

**Interfaces:**
- Produces: `doDiscover(t)` → `{ ok:true, text, pendingGen:{ type:"place", query } }`; `applyAction` case `"discover"`; offline phrases; LLM schema includes `discover`.

- [ ] **Step 1: Add `doDiscover` and switch case**

In `index.html`, after `doAsk` (near line 626), add:

```js
function doDiscover(t){
  const q = String(t||"").trim();
  return {
    ok:true,
    text:"You search for a way onward…",
    cls:"fog",
    pendingGen:{ type:"place", query: q || "What lies near here?" }
  };
}
```

In `applyAction` switch, add:

```js
case "discover": return doDiscover(a.target || a.say);
```

- [ ] **Step 2: Offline parse + LLM schema**

In `offlineParse`, before the final unknown→ask fallback (~line 836), add:

```js
if(/\b(discover|explore beyond|find a new place|scout for a path|scout ahead)\b/.test(t)){
  const m = t.match(/\b(?:discover|explore beyond|find a new place|scout for a path|scout ahead)\s*(.*)$/);
  return one("discover", (m && m[1] || "").trim() || null, null, text);
}
```

In `callLLM` system prompt schema line, change action list to include `discover`:

```text
Schema per action: {"action":"go|take|examine|salvage|use|build|signal|tame|launch|eat|ask|look|wait|discover","target":string|null,"item":string|null,"say":string|null}.
```

Add priority bullet: `7. "discover" / "explore beyond" / "find a new place" → discover.`

- [ ] **Step 3: Manual browser check**

Open `index.html`, type `discover`, confirm thinking + place accept/reject log line (needs API key / `/api/llm`). If no key: confirm offline parse returns discover via console — temporarily log `offlineParse("discover")` in console.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: wire discover action to place generation

EOF
)"
```

---

### Task 2: Extract `src/engine.js` + `createGame()`

**Files:**
- Create: `src/engine.js`
- Modify: `index.html` (thin view)
- Test: `harness/tests/test-engine-adapter.mjs`

**Interfaces:**
- Produces:

```js
export function createGame(opts = {}) {
  // opts: { llm?: (system, user, maxTokens) => Promise<string|null>,
  //         storage?: { getItem, setItem, removeItem },
  //         arm?: "spine"|"full"|"blind" }
  return {
    reset(resetOpts?),
    observe(mode?: "privileged"|"blind"),
    act(action),           // sync
    genStep(pendingGen),   // async
    isOver(), ending(), metrics(), loreStats(),
    dumpHarvest(), exportState(),
  };
}
export { WORLD_DOC, offlineParse, buildWorld }; // as needed by harness
```

**Extraction method (do not invent a second ruleset):**
1. Copy the `<script>` body from `index.html` into `src/engine.js`.
2. Remove UI: `render`, `asciiMeter`, toast/thinking DOM, event listeners, `showEnd`, journal DOM.
3. Keep shared-lore `pullLore`/`pushLore`/`contribute` **out of** `src/engine.js` (stay in `index.html` only).
4. Replace `localStorage` with `opts.storage` defaulting to in-memory Map for Node, or `localStorage` when present.
5. Replace `llmText` / `callLLMProxy` internals so `genStep` uses `opts.llm` when provided; if missing, gen returns `verdict:"unavailable"`.
6. Wrap mutable singleton `S`/`LORE`/`WORLD` behind `createGame` — **MVP: one active game at a time** (reset replaces `S`/`LORE`). Rebuild `WORLD = buildWorld(WORLD_DOC)` on reset so generated places/entities from prior runs do not leak.
7. Implement `observe`, `act`, `genStep`, stats, `dumpHarvest` per spec §3.2–3.3.
8. On `arm === "spine"`, `genStep` returns `{ kind:"gen", type, ok:false, verdict:"skipped" }` with no mutations.
9. `index.html` becomes: CSS/HTML unchanged; `<script type="module">` imports `createGame`, wires UI `playerTurn` to `act`+`genStep`, keeps network/UI helpers.

- [ ] **Step 1: Write failing adapter test**

Create `harness/tests/test-engine-adapter.mjs`:

```js
import assert from "node:assert/strict";
import { createGame } from "../../src/engine.js";

const mem = new Map();
const storage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const game = createGame({ storage, arm: "spine" });
game.reset({ fresh: true });
const obs = game.observe("privileged");
assert.equal(obs.place, "Shingle Beach"); // or whatever node().name is at start
assert.ok(Array.isArray(obs.exits));

const look = game.act({ action: "look" });
assert.equal(look.ok, true);

const disc = game.act({ action: "discover", target: "north ridge" });
assert.equal(disc.pendingGen?.type, "place");
const gen = await game.genStep(disc.pendingGen);
assert.equal(gen.verdict, "skipped"); // spine

const game2 = createGame({
  storage,
  arm: "full",
  llm: async () => JSON.stringify({
    id: "test_grove", name: "Test Grove",
    desc: "A palm grove near the shore.", dirBack: "south"
  }),
});
game2.reset({ fresh: true });
const d2 = game2.act({ action: "discover" });
const g2 = await game2.genStep(d2.pendingGen);
assert.equal(g2.type, "place");
assert.ok(g2.verdict === "accepted" || g2.verdict === "rejected");

console.log("test-engine-adapter: ok");
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

```bash
node harness/tests/test-engine-adapter.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for `src/engine.js`.

- [ ] **Step 3: Implement `src/engine.js` + thin `index.html`**

Follow extraction method above. Critical `createGame` pieces:

```js
export function createGame(opts = {}) {
  const storage = opts.storage || defaultStorage();
  const arm = opts.arm || "full";
  const llm = opts.llm || null;
  let harvest = [];

  function reset(resetOpts = {}) {
    // rebuild WORLD from WORLD_DOC clone so map growth cannot leak
    // newGame(fresh: true); skip pullLore
    // seed lore from WORLD_DOC only
    harvest = [];
  }

  function observe(mode = "privileged") { /* privileged vs blind per spec */ }

  function act(action) {
    const res = applyAction(normalizeParsed(action));
    // do not call gen here
    return res;
  }

  async function genStep(pending) {
    if (!pending) return null;
    if (arm === "spine") {
      return { kind: "gen", type: pending.type, ok: false, verdict: "skipped" };
    }
    // call genLore / genEmergent / genPlace using llm; push to harvest on accept
    // return unified shape from spec
  }

  return { reset, observe, act, genStep, isOver, ending, metrics, loreStats, dumpHarvest, exportState };
}
```

`index.html` module bootstrap sketch:

```js
import { createGame, offlineParse /* + helpers needed for NL */ } from "./src/engine.js";

const game = createGame({
  llm: async (system, user, maxTokens) => {
    const r = await fetch(API_BASE + "/llm", { /* same as callLLMProxy */ });
    const d = await r.json();
    return d.content || null;
  },
});
// playerTurn: parse NL → for each step: game.act → if pendingGen await game.genStep → pushLog
```

- [ ] **Step 4: Run adapter test — expect PASS**

```bash
node harness/tests/test-engine-adapter.mjs
```

Expected: `test-engine-adapter: ok`

- [ ] **Step 5: Shared-lore regression**

```bash
npm run test:shared-lore
```

Expected: all assertions pass.

- [ ] **Step 6: Commit**

```bash
git add src/engine.js index.html harness/tests/test-engine-adapter.mjs
git commit -m "$(cat <<'EOF'
refactor: extract Meridian engine behind createGame

EOF
)"
```

---

### Task 3: Fixtures + `replay.mjs`

**Files:**
- Create: `harness/fixtures/survive-salvage-path.json`
- Create: `harness/fixtures/ending-raft.json`
- Create: `harness/replay.mjs`
- Test: run replay CLI (acts as test)

**Interfaces:**
- Consumes: `createGame` from `src/engine.js`
- Produces: CLI `node harness/replay.mjs <fixture.json>` exit 0 on match

Fixture schema:

```json
{
  "name": "ending-raft",
  "arm": "spine",
  "actions": [
    { "action": "go", "target": "east" },
    { "action": "salvage", "target": "tools" },
    { "action": "salvage", "target": "sailcloth" },
    { "action": "go", "target": "west" },
    { "action": "go", "target": "north" },
    { "action": "take", "target": "bamboo" },
    { "action": "go", "target": "south" },
    { "action": "go", "target": "south" },
    { "action": "build", "target": "raft" },
    { "action": "launch" }
  ],
  "expect": {
    "ending": "raft_escape",
    "flags": { "raftBuilt": true }
  }
}
```

`survive-salvage-path.json`: go east, salvage tools, salvage sailcloth, go west; expect `metrics.salvaged` or inventory contains tools+sailcloth, `ending: null`, `clock` advanced.

- [ ] **Step 1: Write both fixture files** (paths above; adjust directions if a step rejects — iterate against engine).

- [ ] **Step 2: Implement `harness/replay.mjs`**

```js
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createGame } from "../src/engine.js";

const path = process.argv[2];
if (!path) { console.error("usage: node harness/replay.mjs <fixture.json>"); process.exit(2); }
const fix = JSON.parse(readFileSync(path, "utf8"));
const game = createGame({ arm: fix.arm || "spine" });
game.reset({ fresh: true });

for (const a of fix.actions) {
  const res = game.act(a);
  if (res.pendingGen) await game.genStep(res.pendingGen); // spine → skipped
  if (!res.ok) console.warn("reject", a, res.text);
}

const st = game.exportState();
if (fix.expect.ending) assert.equal(game.ending(), fix.expect.ending);
if (fix.expect.flags) {
  for (const [k, v] of Object.entries(fix.expect.flags)) {
    assert.equal(st.flags[k], v, k);
  }
}
console.log("replay ok:", fix.name);
```

- [ ] **Step 3: Run replays**

```bash
node harness/replay.mjs harness/fixtures/survive-salvage-path.json
node harness/replay.mjs harness/fixtures/ending-raft.json
```

Expected: both print `replay ok: …`. Fix fixture actions if wreck/clock causes perish — salvage only two cargos then leave shore quickly.

- [ ] **Step 4: Commit**

```bash
git add harness/fixtures harness/replay.mjs
git commit -m "$(cat <<'EOF'
test: add spine fixture replay for salvage and raft ending

EOF
)"
```

---

### Task 4: Config + LLM transport

**Files:**
- Create: `harness/config.mjs`
- Create: `harness/llm.mjs`
- Create: `harness/runs/.gitignore`, `harness/reports/.gitignore`, `harness/harvest/.gitignore` (ignore `*` keep `.gitignore`)
- Test: `harness/tests/test-config.mjs`

**Interfaces:**
- Produces: `loadConfig()`, `createLlmClient(config) => { complete({system,user,maxTokens}), model, transport }`

- [ ] **Step 1: Failing test for config defaults**

```js
import assert from "node:assert/strict";
import { loadConfig } from "../config.mjs";

const c = loadConfig({ env: { OPENROUTER_API_KEY: "x" } });
assert.equal(c.PLAYER_MODEL, "nvidia/nemotron-3-ultra-550b-a55b:free");
assert.equal(c.RUNS_SPINE, 10);
assert.equal(c.MAX_GEN_PER_RUN, 40);
assert.equal(c.CRITIC_ENABLED, false);
console.log("test-config: ok");
```

- [ ] **Step 2: Implement `config.mjs` + `llm.mjs`**

`loadConfig` reads `.env` from repo root (simple line parser: `KEY=VAL`, skip comments) and merges process.env. Defaults from spec §5.1.

`createLlmClient`:
- If `config.API_BASE`, POST `${API_BASE}/llm` with `{ system, user, maxTokens }` → `{ content, status, transport:"proxy" }`.
- Else POST OpenRouter chat completions with model `config.PLAYER_MODEL`, header `Authorization: Bearer …`, `HTTP-Referer: http://localhost` → `{ content, status, transport:"direct" }`.
- Map HTTP 429 → `status:"rate_limit"`; network throw → `transport_fail`.

- [ ] **Step 3: Pass test + commit**

```bash
node harness/tests/test-config.mjs
git add harness/config.mjs harness/llm.mjs harness/tests/test-config.mjs harness/runs harness/reports harness/harvest
git commit -m "$(cat <<'EOF'
feat: harness config and LLM transport

EOF
)"
```

---

### Task 5: Offline player + `run.mjs` (spine)

**Files:**
- Create: `harness/player-offline.mjs`
- Create: `harness/run.mjs`
- Test: `harness/tests/test-run-spine.mjs`

**Interfaces:**
- Consumes: `createGame`, `loadConfig`, offline parse
- Produces: `runGame({ arm, observeMode, config, decideAction? }) => runObject` (spec §5.4); writes `harness/runs/<id>.json`

- [ ] **Step 1: Failing spine run test**

```js
import assert from "node:assert/strict";
import { loadConfig } from "../config.mjs";
import { runGame } from "../run.mjs";
import { decideOffline } from "../player-offline.mjs";

const config = loadConfig({
  env: {},
  overrides: { MAX_TURNS: 50, RECORD_DIR: "harness/runs" },
});
const run = await runGame({
  arm: "spine",
  observeMode: "privileged",
  config,
  decideAction: decideOffline,
});
assert.ok(run.ending === "turn_cap" || run.ending === "perish" || run.ending);
assert.equal(run.genCalls, 0);
assert.ok(run.genSkipped >= 0);
assert.ok(Array.isArray(run.trajectory));
console.log("test-run-spine: ok", run.ending, run.turns);
```

- [ ] **Step 2: Implement offline player**

```js
import { offlineParse } from "../src/engine.js";

export function decideOffline(observation, history) {
  // Prefer look first turn; then try exits[0]; then wait — dumb but deterministic
  if (history.length === 0) return { action: "look", parsedOk: true, usedLLM: false };
  const exits = observation.exits || [];
  if (exits.length) {
    const i = history.length % exits.length;
    return { action: "go", target: exits[i], parsedOk: true, usedLLM: false };
  }
  return { action: "wait", parsedOk: true, usedLLM: false };
}

export function decideOfflineFromText(text) {
  const p = offlineParse(text);
  const a = p.actions ? p.actions[0] : p;
  return { ...a, parsedOk: true, usedLLM: false };
}
```

(For spine LLM-less runs, `decideOffline` policy above is enough.)

- [ ] **Step 3: Implement `runGame`**

Core loop:

```js
export async function runGame({ arm, observeMode, config, decideAction, llmClient = null }) {
  const engineLlm = llmClient
    ? async (system, user, maxTokens) => {
        const r = await llmClient.complete({ system, user, maxTokens });
        return r.content;
      }
    : null;
  const game = createGame({ arm, llm: engineLlm });
  game.reset({ fresh: true });
  const trajectory = [];
  const failures = { parse_fail:0, rate_limit:0, transport_fail:0, empty:0, engine_reject:0 };
  let genCalls=0, genRejections=0, genSkipped=0;
  let ending = null;
  let promptVersion = "offline";
  const startedAt = new Date().toISOString();
  const id = `${Date.now()}-${arm}-${Math.random().toString(36).slice(2,8)}`;

  for (let turns = 0; turns < config.MAX_TURNS; turns++) {
    if (game.isOver()) break;
    const obs = game.observe(observeMode);
    const decision = await decideAction(obs, trajectory);
    if (decision.promptVersion) promptVersion = decision.promptVersion;
    if (decision.failure === "parse_fail") failures.parse_fail++;
    if (decision.failure === "rate_limit") failures.rate_limit++;
    if (decision.failure === "transport_fail") failures.transport_fail++;
    if (decision.failure === "empty") failures.empty++;
    if (decision.abort === "rate_limit") {
      ending = "rate_limit_abort";
      break;
    }
    const action = {
      action: decision.action,
      target: decision.target ?? null,
      item: decision.item ?? null,
      say: decision.say ?? null,
    };
    const result = game.act(action);
    if (!result.ok) failures.engine_reject++;
    trajectory.push({ kind: "act", obs, action, result, raw: decision.raw, parsedOk: decision.parsedOk !== false });

    if (result.pendingGen) {
      if (arm === "spine" || genCalls >= config.MAX_GEN_PER_RUN) {
        const g = await game.genStep(result.pendingGen); // skipped under spine
        genSkipped++;
        trajectory.push(g);
      } else {
        const g = await game.genStep(result.pendingGen);
        genCalls++;
        if (g.verdict === "rejected" || g.verdict === "unavailable") genRejections++;
        trajectory.push(g);
      }
    }
  }
  if (!ending) {
    ending = game.isOver() ? game.ending() : "turn_cap";
  }
  const run = {
    id, arm, observeMode, promptVersion,
    model: config.PLAYER_MODEL,
    transport: llmClient?.transport ?? "none",
    startedAt, ending, metrics: game.metrics(),
    turns: trajectory.filter(s => s.kind === "act").length,
    trajectory, loreStats: game.loreStats(), failures,
    genCalls, genRejections, genSkipped,
    harvestRef: null, selfReport: null,
  };
  // writeFileSync `${config.RECORD_DIR}/${id}.json`; update manifest.json
  return run;
}
```

Fix any bugs so the test passes (offline wanderer will often `perish` or `turn_cap` — that is fine).

- [ ] **Step 4: Pass test + commit**

```bash
node harness/tests/test-run-spine.mjs
git add harness/player-offline.mjs harness/run.mjs harness/tests/test-run-spine.mjs
git commit -m "$(cat <<'EOF'
feat: spine run loop with offline player

EOF
)"
```

---

### Task 6: LLM player + full/blind smoke

**Files:**
- Create: `harness/player.mjs`
- Modify: `harness/run.mjs` (CLI `--arm`)
- Test: `harness/tests/test-player-prompt.mjs` (no network); optional live smoke

**Interfaces:**
- Produces: `buildSystemPrompt`, `promptVersion`, `createDecideAction(llmClient, config)`

- [ ] **Step 1: Prompt unit test (no network)**

```js
import assert from "node:assert/strict";
import { buildSystemPrompt, hashPromptVersion } from "../player.mjs";

const p = buildSystemPrompt({
  arm: "full",
  observeMode: "privileged",
  constraints: ["no magic"],
  title: "York",
});
assert.match(p, /discover/);
assert.doesNotMatch(p, /Jungle Interior[\s\S]*Tide Pools[\s\S]*Cliff/); // no god-map of all nodes
const v = hashPromptVersion(p, "privileged-v1");
assert.equal(typeof v, "string");
assert.ok(v.length >= 8);
console.log("test-player-prompt: ok");
```

- [ ] **Step 2: Implement `player.mjs`**

- System prompt: identity one-liner, constraints, action schema **including discover**, win/lose summary, “engine owns truth”, explore invite on full/blind. **No full node list.**
- `decideAction`: call `llmClient.complete`; parse JSON (extract `{...}`); retry once; on fail return `{ action:"look", parsedOk:false, failure:"parse_fail" }`; on rate_limit after one backoff return `{ abort:"rate_limit", failure:"rate_limit" }`.
- `hashPromptVersion`: node `crypto.createHash("sha256").update(template + observeSchemaId).digest("hex").slice(0,16)`.

- [ ] **Step 3: CLI on `run.mjs`**

```bash
node harness/run.mjs --arm spine --baseline offline
node harness/run.mjs --arm full --observe privileged   # needs key
```

For full arm without burning budget in CI, add `harness/tests/test-gen-smoke.mjs` that injects a fake `llm` on `createGame` and a scripted `decideAction` returning `ask` then `discover`:

```js
// scripted decideAction forces ask then discover; fake llm returns lore JSON then place JSON
// assert trajectory has gen type lore + place; dumpHarvest length >= 0
```

- [ ] **Step 4: Commit**

```bash
git add harness/player.mjs harness/run.mjs harness/tests/test-player-prompt.mjs harness/tests/test-gen-smoke.mjs
git commit -m "$(cat <<'EOF'
feat: LLM player and full-arm gen smoke

EOF
)"
```

---

### Task 7: Analyze + harvest

**Files:**
- Create: `harness/analyze.mjs`
- Create: `harness/harvest.mjs`
- Test: `harness/tests/test-analyze.mjs`

**Interfaces:**
- Consumes: array of run objects / manifest
- Produces: `analyze(runs) => signals`; `writeHarvest(batchId, runs, config) => path`

- [ ] **Step 1: Failing analyze test with fixture runs**

Create minimal fake runs inline in the test (2 spine perish, 1 full with gen accept):

```js
import assert from "node:assert/strict";
import { analyze } from "../analyze.mjs";

const signals = analyze([
  { arm:"spine", observeMode:"privileged", ending:"perish", trajectory:[
    { kind:"act", action:{action:"go"}, result:{ok:false,text:"blocked"} },
  ], failures:{engine_reject:1,parse_fail:0,rate_limit:0,transport_fail:0,empty:0}, genCalls:0 },
  { arm:"full", observeMode:"privileged", ending:"raft_escape", trajectory:[
    { kind:"gen", type:"lore", verdict:"accepted", answer:"Crabs live in the pools." },
    { kind:"gen", type:"place", verdict:"accepted", place:{ id:"x", name:"X" } },
  ], failures:{engine_reject:0,parse_fail:0,rate_limit:0,transport_fail:0,empty:0}, genCalls:2,
    metrics:{ clock:10 }, loreStats:{ nodes:5, generated:2 } },
]);
assert.ok(signals.mechanics.rejectionHotlist);
assert.ok(signals.loop.byArm.full);
assert.ok(signals.world.placeAcceptRate !== undefined);
assert.notEqual(signals.loop.byArm.spine?.endingCounts, signals.loop.byArm.full?.endingCounts);
console.log("test-analyze: ok");
```

- [ ] **Step 2: Implement analyze (spec §5.6 A/B/C) + harvest**

`harvest.mjs`: collect accepted fact/place/entity/emerge_lore from trajectory; de-dupe by normalized text; write `harness/harvest/<batchId>.json`.

- [ ] **Step 3: Pass test + commit**

```bash
node harness/tests/test-analyze.mjs
git add harness/analyze.mjs harness/harvest.mjs harness/tests/test-analyze.mjs
git commit -m "$(cat <<'EOF'
feat: stratified analyze and lore harvest export

EOF
)"
```

---

### Task 8: Report + loop + optional critic

**Files:**
- Create: `harness/report.mjs`
- Create: `harness/critic.mjs`
- Create: `harness/loop.mjs`
- Modify: `package.json` (scripts)
- Modify: `README.md` (short harness section)
- Test: `harness/tests/test-report.mjs`

- [ ] **Step 1: Report unit test**

```js
import assert from "node:assert/strict";
import { writeReport } from "../report.mjs";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "york-report-"));
const { reportPath, metricsPath } = writeReport({
  outDir: dir,
  signals: {
    mechanics: { summary: "ok" },
    loop: { summary: "ok" },
    world: { summary: "ok", harvestPath: "harness/harvest/x.json" },
  },
  manifest: { promptVersion: "abc", runs: [] },
  proxyNotes: null,
});
const md = readFileSync(reportPath, "utf8");
assert.match(md, /Mechanics/);
assert.match(md, /Game loop/);
assert.match(md, /World/);
assert.doesNotMatch(md, /^## Fun/m);
console.log("test-report: ok");
```

- [ ] **Step 2: Implement `report.mjs`, `critic.mjs`, `loop.mjs`**

`loop.mjs` order:
1. Replay all fixtures in `harness/fixtures/` — fail → `process.exit(1)`.
2. For `i in RUNS_SPINE`: `runGame({ arm:"spine", observeMode:"privileged", decideAction: offline or llm })`.
3. For full / blind with LLM decideAction (require key unless `BASELINE=offline`).
4. Honor `MAX_TOKENS_PER_LOOP` if client tracks usage; stop scheduling new runs when exceeded.
5. `analyze` → `writeHarvest` → optional `critic` if `CRITIC_ENABLED` → `writeReport`.
6. Print report path.

`package.json` scripts:

```json
"harness": "node harness/loop.mjs",
"harness:replay": "node harness/replay.mjs",
"test:harness": "node harness/tests/test-engine-adapter.mjs && node harness/tests/test-config.mjs && node harness/tests/test-run-spine.mjs && node harness/tests/test-player-prompt.mjs && node harness/tests/test-gen-smoke.mjs && node harness/tests/test-analyze.mjs && node harness/tests/test-report.mjs"
```

- [ ] **Step 3: Dry-run loop with tiny counts**

```bash
# overrides via env
RUNS_SPINE=1 RUNS_FULL=0 RUNS_BLIND=0 BASELINE=offline node harness/loop.mjs
```

Expected: fixtures pass, one spine run, report written, exit 0.

- [ ] **Step 4: Commit**

```bash
git add harness/report.mjs harness/critic.mjs harness/loop.mjs harness/tests/test-report.mjs package.json README.md
git commit -m "$(cat <<'EOF'
feat: harness loop, report, and optional critic

EOF
)"
```

---

### Task 9: Verification gate (MVP done)

**Files:** none new (run checks)

- [ ] **Step 1: Full harness unit suite**

```bash
npm run test:harness
npm run test:shared-lore
```

Expected: all ok.

- [ ] **Step 2: Fixture replays**

```bash
npm run harness:replay -- harness/fixtures/ending-raft.json
npm run harness:replay -- harness/fixtures/survive-salvage-path.json
```

- [ ] **Step 3: Manual browser check** (human): look, ask→lore, discover→place, unmatched use→emerge still work on thin `index.html`.

- [ ] **Step 4: Optional live micro-batch** (needs key)

```bash
RUNS_SPINE=2 RUNS_FULL=2 RUNS_BLIND=1 node harness/loop.mjs
```

Confirm report has three goal sections; harvest file exists if any gen accepted.

- [ ] **Step 5: Final commit only if Step 3–4 caused doc tweaks**

```bash
git status
# commit README/path fixes if any
```

---

## Spec coverage checklist

| Spec section | Task(s) |
|--------------|---------|
| §4 discover | Task 1 |
| §3 extract + createGame | Task 2 |
| §2 fixtures / success #1 | Task 3, 9 |
| §5.1 config, budgets | Task 4, 8 |
| §5.3–5.4 spine run | Task 5 |
| §5.2 player, observe, promptVersion | Task 6 |
| §5.6 analyze, §7 harvest | Task 7 |
| §5.7–5.9 report/loop/critic | Task 8 |
| §2 success criteria / §9 verify | Task 9 |
| Phase 4 | Deferred (not in plan) |

## Out of scope (do not implement in this plan)

- Shared-tier harness coverage, Gray Light adapter, learnability pass, trend UI.
- Auto-promote harvest → canonical world JSON.
- Tightening `emerge` into engine-owned outcomes.
