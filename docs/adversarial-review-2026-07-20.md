# York — Adversarial Review (2026-07-20)

Scope: full codebase of *York — The Wreck of the Meridian* (deterministic engine +
free-LLM narration, three-tier lore memory, OpenSpec-in-repo, headless playtest harness).
Method: read every source/spec/doc file, executed the test suites and offline
playthroughs, diffed the embedded world against the canonical world, and drove the
JSON extractors with realistic model output. Findings are labelled **VERIFIED** (proven
by running code / diffing files) or **OBSERVED** (evidenced by code reading).

> Note: this was requested as `/adversarial-review` from `payscore/claude/adversarial-code-review-hhednh`.
> That skill lives in the `Payscore/payscore` repo, which is cross-tier to this
> `mcarlssen/york` session and could not be attached, so the review follows that
> method in spirit rather than from its exact text.

---

## TL;DR

The deterministic spine is genuinely good — clean action pipeline, real map/inventory/meter
model, offline fallback, and a coherent three-tier memory *design*. The fragility you feel
is not randomness; it has specific, fixable causes:

1. **The shipped default model is structurally incompatible with the interpreter.** The
   default is a *reasoning* model that emits `<think>…</think>`; the interpreter's JSON
   extractor breaks on the braces inside those tags and returns `null`, so nearly every
   command silently falls back to the offline regex parser. The "LLM understands plain
   language" layer is effectively off out of the box.
2. **The narration cleaner deletes valid prose** — any sentence starting with "You are/can/
   will/…" is dropped, so replies look truncated and inconsistent.
3. **The "single source of truth" is not.** The engine's embedded world has drifted 15 ways
   from `world.json`, including two rooms that are *unreachable* in the canonical map and two
   whole sections (`puzzles`, `endings`) the engine ignores entirely.
4. **The specs describe an older, different game** (lighthouse/keeper, storm/beam meters) and
   a defunct world-file schema. For a less-capable model reading these to "understand intent,"
   the specs actively mislead.
5. **The lore graph is a tag-scored bag of sentences**, not a graph — edges are never used in
   retrieval, and stop-word noise pollutes the top-K the model sees.

Everything below is organized so you can triage: **P0** breaks core promises, **P1** degrades
quality/reliability, **P2** is hygiene/drift. The spec-realignment plan at the end is written
for the stated goal: making this reliable for *less-intelligent* models.

---

## What the project is doing right

- **Engine-owns-truth architecture is sound.** All state changes flow through `applyAction()`
  (`src/engine.js:378`); the LLM proposes, the engine validates and applies. This is the
  correct shape and mostly honored.
- **Offline parser as a floor is a strong idea** and is reasonably capable (`offlineParse`,
  `engine.js:704`) — 15/15 parse tests pass.
- **Three-tier memory (local → shared → canonical) is a genuinely good concept** with the
  right precedence rules and a human-in-the-loop curator boundary. The push/pull/validate
  round-trip, tombstones, and dedup all exist and the shared-lore tests (12 assertions) pass.
- **Test coverage exists and is green:** 45 script assertions + 7 harness tests + 2 fixture
  replays all pass.
- **The LLM router admin** (`admin.html` + `api/lore.js` + `scripts/lib/llm-config.mjs`) is a
  clean, well-scoped feature: keys stay server-side, endpoint/model/key-env are editable, and
  values never leak to the client.
- **Debug mode** (per-turn HTTP + engine-event capture attached to the log entry) is a good
  observability tool and is faithfully implemented.
- **The world fiction is coherent and well-written** — the constraints, endings, and prose
  have a strong point of view.

---

## P0 — Breaks a core promise

### P0-1 The default model's `<think>` output kills command interpretation — VERIFIED
Default model is `nvidia/nemotron-3-ultra-550b-a55b:free` (`scripts/lib/llm-config.mjs:14`),
a reasoning model that prefixes `<think>…</think>`. The interpreter path
(`callLLM` → `extractJSON`, `index.html:299,306`) takes the substring from the first `{` to
the last `}`. A `<think>` block containing braces corrupts that span, so `JSON.parse` fails
and `extractJSON` returns `null`.

Proven:
```
extractJSON('<think>...return {action:go}...</think>{"action":"go","target":"jungle"}') → null
```
Effect: with the out-of-the-box model, virtually every turn silently degrades to the offline
regex parser. Plain-language commands only work to the extent the regex handles them — which
*is* the "flaky/broken" experience. Note the lore path survives this (it has `salvageLoreJSON`
as a backstop) but the **interpreter path has no salvage net**, so it fails hardest on the
most important call.

Fix direction: (a) strip `<think>…</think>` (and a bare leading `</think>`) before extraction;
(b) request `response_format: {type:"json_object"}` where the provider supports it; (c) give
the interpreter the same salvage fallback the lore path has; (d) change the default to a model
that reliably emits plain JSON, and document reasoning-model incompatibility.

### P0-2 `cleanGeneration` silently deletes valid second-person narration — VERIFIED
The per-sentence meta-filter (`engine.js:808`) drops any sentence matching
`^you (are|need|should|must|can|will)…`. This is meant to strip leaked model reasoning, but it
also eats legitimate flavor:
```
IN : "The fig tree hangs heavy overhead. You can hear a parrot calling from the cliff."
OUT: "The fig tree hangs heavy overhead."
```
Multi-sentence replies lose their atmospheric lines, which reads as the model being
inconsistent when the cleaner is the culprit. Fix: only strip sentences that match the
narrower *leak* patterns (meta-commentary about rules/constraints), not ordinary
second-person narration.

### P0-3 Canonical map orphans two rooms; two endings unreachable in canon — VERIFIED
In `openspec/world/world.json`, `beach.exits` = `{west, north, east, up}` — nothing links to
`cove` or `camp`. The engine's embedded `WORLD_DOC` added `south:"cove"` and
`south_east:"camp"` (`engine.js:82`). So **per the file the README calls the single source of
truth, the raft-escape ending (cove) and the endure/shelter ending (camp) cannot be reached.**
Only the drifted embed is playable. This inverts the stated architecture (embed = mirror of
canon).

### P0-4 Offline `launch` does not launch — VERIFIED
Bare `launch` falls through the offline parser to the catch-all `ask` intent; only
"launch the raft"/"launch raft" match (`engine.js:788`). The README documents `launch` as a
control and the spec calls the offline parser the "guaranteed floor," yet the two escape
endings can't be triggered offline with the documented word. Confirmed in a full offline
playthrough (raft & balloon runs ended `over=false`). Fix: add a bare `launch`/`set sail`/
`cast off` rule mapping to the `launch` action.

### P0-5 "Open index.html in any browser — no build step" is false — VERIFIED
`index.html:72-74` uses `<script type="module">` importing `./src/engine.js`, which imports
`../scripts/lib/world-memory.mjs` (`engine.js:1`). Browsers block ES-module imports under
`file://` (CORS), so double-clicking the file fails; it needs a local server. The embed's
stated purpose ("so it runs from file:// with no fetch/build step", `engine.js:39`) no longer
holds. Fix: either bundle to a single file for the `file://` promise, or update the README to
say "serve locally."

---

## P1 — Degrades quality / reliability

### P1-1 Every question spends two model calls; the first is discarded — VERIFIED
`playerTurn` always calls `callLLM` (one `/api/llm` round-trip), then for any question throws
that parse away and re-parses offline (`index.html:325`) before firing `genLore` (a second
call). On a rate-limited free tier this doubles 429 pressure on the most common interaction.
Fix: detect questions *before* the interpret call and skip it, or reuse the first call's result.

### P1-2 One model does interpretation *and* canon validation — VERIFIED
`resolveLlmConfig` returns a single `model`; both the player proxy and `semanticConflict`
(lore validation) call it (`api/lore.js:100,425`). The README still claims a separate
`openai/gpt-4o-mini` validator (`README.md:193`) — no longer true. Your consistency gate runs
on the same unreliable free model. Fix: restore a dedicated validator model (small, cheap,
JSON-reliable) or document that they are unified.

### P1-3 The lore "graph" is a tag-scored bag; edges unused; stop-words pollute retrieval — VERIFIED
`LoreGraph.retrieve` (`engine.js:204`) scores by substring token overlap plus a tag bonus that
only fires when the player's text literally contains a tag word ("ecology","rule") — which it
essentially never does. It keeps 3-letter tokens, so "the"/"you"/"was" score against every
node. And **edges are never consulted in retrieval** — they're only used for journal display
(`journalLinks`, `engine.js:1346`). So the top-6 injected into the prompt are noisy and weakly
relevant, which is exactly the "lore graph doesn't perform" symptom. Fix: drop stop-words,
weight subject/object over generic text, optionally expand the candidate set by 1-hop edge
traversal from the best matches, and boost by tag *set* membership rather than substring.

### P1-4 Local lore is never de-duplicated → journal bloat → worse retrieval — VERIFIED
Local commits use a monotonic id (`commitLore("gen:"+(LORE.seq+1),…)`, `engine.js:1141`) with
no similarity check; only the *server* dedups on push. Re-asking a question stores near-dupes
locally, inflating the journal and further polluting retrieval. Fix: apply the existing
`loreTextSimilar` (0.75 Jaccard, already in the file, `engine.js:228`) at local commit time.

### P1-5 Clock-expiry endings and emergent death aren't detected promptly — VERIFIED
`checkEnd()` is called only from `doGo` (`engine.js:454`) and `doWait` (`engine.js:658`). If a
player hits clock 16 via salvage/build/eat/ask, or if a `genEmergent` `lifeDelta` drops life to
0 (`engine.js:878`, which never calls `checkEnd`), the ending isn't evaluated until the next
move/wait. In the harness this shows up as spurious `turn_cap` results; in play it delays
death/endings. Fix: call `checkEnd()` at the end of the action pipeline (in `act()`), and after
`genEmergent` applies deltas.

### P1-6 LLM mutates meters/inventory outside `applyAction` — OBSERVED (spec violation)
`game-architecture` spec: "ONLY `applyAction()` … may mutate state" and meters "SHALL NOT be
mutable by the LLM." But `genEmergent` applies an LLM-proposed `lifeDelta` and `consumeItem`
directly (`engine.js:878-881`), and `applyEntities` pushes LLM-invented items into inventory
(`engine.js:326`), both inside `genStep`, not `applyAction`. Validation is bounds/regex-only,
not rules-mediated. Either bring these under `applyAction`'s contract or amend the spec to
carve out "bounded procedural generation" explicitly.

### P1-7 Restart wipes un-pushed local lore, violating "extend, not reset" — VERIFIED
Spec: a new session SHALL extend the graph, facts SHALL persist. But restart (`R`/end-modal)
calls `boot(true)` → `reset({fresh:true})`, which deletes the persisted lore store
(`engine.js:1066-1068`). Un-pushed local discoveries are destroyed; only server-merged facts
return via `pullLore`. (Initial page load `boot(false)` does preserve.) Decide whether restart
should keep the lore graph, and align spec + code.

### P1-8 Harness: full-batch defaults will hit 429 storms and misreport failures — VERIFIED (by harness audit)
- Non-429 HTTP errors (401/403/5xx) are bucketed as `empty`, not `transport_fail`
  (`harness/llm.mjs:22`, unhandled `"error"` status in `player.mjs`) — the failure taxonomy is
  wrong when the key is invalid.
- `run.mjs` has no API-key guard, so a keyless `--arm full` persists a 200-turn garbage run.
- `loop.mjs` default baseline `"llm"` burns tokens on the *spine* runs whose whole purpose is
  to isolate engine bugs from LLM noise; the intended "spine offline" path is only reachable
  via an undocumented magic `BASELINE` value (`loop.mjs:138`).
- Rate-limit abort can fire after a *single* 429 (`player.mjs:114`), and nothing implements the
  loop-level "stop on sustained rate-limit," so a 429 storm burns 2 calls × all 35 scheduled runs.
- No fetch timeout anywhere (`llm.mjs`) — a hung endpoint stalls the whole batch.

### P1-9 Harness analysis + report are largely hollow — VERIFIED (by harness audit)
`analyze.mjs` implements only a fraction of the design's signals (no soft-lock heuristics, no
mechanic touch-rates, no privileged-vs-blind comprehension gap, no contradiction/echo
detection); `emerge` life/consume stats are *impossible* because the engine returns them as
`undefined` (`engine.js:1177`). `report.md` is content-free — `summarize()` returns only the
injected one-line `.summary`, so every real number lives only in `metrics.json` (verified via
a smoke run). The `improvise` gen type is invisible to analysis entirely.

---

## P2 — Hygiene, drift, and stale specs

These matter most for your stated goal (specs that guide weaker models), because a model
reading them will absorb false intent.

- **Specs describe a different, older game** — VERIFIED. `openspec/specs/game-architecture/spec.md:13`
  lists meters "life / storm / beam"; `world-rules/spec.md:44` gives an ending "storm reaches
  peak with beam ≥ 5 → reignition"; `:24` cites "light-as-beacon, perception corruption"; `:39`
  "Keeper voices." None exist — these are lighthouse-keeper-era leftovers. Actual meters are
  `life/warmth/signal/clock/wreck`.
- **Endings are not data-governed** — VERIFIED. `world-rules/spec.md:43` requires each ending be
  a deterministic condition the engine evaluates from data; the engine never reads
  `world.json.endings[].condition` — conditions are hardcoded, and they *diverge*: canon
  `rescue_ship` requires "clock not expired" but `checkEnd` grants it exactly at clock expiry
  (`engine.js:669`).
- **`story`/`story_gaps` are dead data** — VERIFIED. Nothing reads `world.json.story`; the
  canon context fed to the LLM (`api/lore.js:60`) omits it, so the intended narrative beats and
  open questions never reach the model.
- **`world_definition_spec.md` + `sample_world.json` document a defunct schema** — VERIFIED.
  They describe a regions/locations/coordinates/NPC fantasy-RPG format that matches neither
  `world.json` nor each other (`sample_world.json` uses a third shape). The README still lists
  both as current design docs. The *operative* schema (`world.json`'s) is documented nowhere
  except by example.
- **`master_game_design_doc.md` drift** — OBSERVED. Claims server-side state persistence and
  "persistent online access assumed"; the game is localStorage-only with an offline floor.
- **`docs/architecture/shared-memory-roundtrip.md` is substantially stale** — VERIFIED. Wrong
  file/line map throughout (functions moved to `src/engine.js`); its Step-5 `validateFactClient`
  regex is *inverted* (shows blocking `jungle|tropical|reef` — the game's own ecology); push
  timing wrong (says session-end, code pushes every turn); tombstones entirely absent; storage
  failure-mode description wrong for production.
- **Font design doc describes a twice-superseded implementation** — VERIFIED. `css/styling.css:2`
  now loads **Monocraft from a jsdelivr CDN** — contradicting the "local vendored font" decision
  and the offline/self-contained story. Four font files (`GeistPixel-Circle`, `Hermit`,
  `scientifica`×2) are committed but referenced by no CSS.
- **Duplicate, unreviewed, never-merged OpenSpec changes** — VERIFIED. The two
  `openspec/changes/*-curate-shared-lore/` dirs are near-identical *test artifacts* (the
  shared-lore test shells out to the curator, which writes a date-named change dir). Their
  candidate fact was never merged into `lore_seed`; no PR/archival step exists. `npm test` is
  **not idempotent** — running it writes a new dated change dir into the working tree (I removed
  the `2026-07-20` one this run). Curator also double-appends the `shared` tag.
- **`admin.html` canon fallback URL is wrong** — VERIFIED. `admin.html:175` points at
  `raw.githubusercontent.com/mike-thorn/york/main/...`; the repo is `mcarlssen/york`. The
  fallback 404s, so if the relative path fails, every shared node is mislabeled "candidate."
- **Duplicated logic across `engine.js` and `index.html`** — VERIFIED. `validateFactClient`
  (`engine.js:275` vs `index.html:89`) and `flattenActions` (`engine.js:976` vs `index.html:77`)
  are copy-pasted; the ecology block-list will drift between them.
- **Dead/incorrect flag** — VERIFIED. `S.flags.craftBuilt` is read in `validateNewPlace`
  (`engine.js:942`) but never set; builds set `raftBuilt`/`balloonBuilt`.
- **Harness dead knobs** — VERIFIED (by harness audit). `TEMPERATURE` and `CRITIC_MODEL` are
  never used; `PLAYER_MODEL`/`LLM_ENDPOINT_URL` env vars are honored by `run.mjs` but silently
  overwritten in `loop.mjs`.

---

## The engine's module-singleton caveat

`S`, `LORE`, `WORLD`, `_llm`, `_arm`, etc. are module-level globals that `createGame` reassigns
(`engine.js:23-29,126`). There is **no active corruption today** — all harness game creation is
strictly sequential. But it is a latent trap: any future parallelism (e.g. `Promise.all` over
the run schedule, or holding two live `createGame` handles — which `test-engine-adapter.mjs`
already does) would silently corrupt state with no error. Worth a comment at minimum, or making
game state instance-scoped.

---

## Recommended path — spec realignment for less-capable models

Your goal is specs that let weaker models execute well. That means the specs must be **true,
executable, and singular**. Priority order:

1. **Make the world truly single-source (P0-3).** Pick one: either the engine *loads*
   `world.json` (best — delete the embed, or generate the embed at build time and check it in
   CI), or add a test that fails when the embed and `world.json` diverge. Fix the canonical map
   so `cove`/`camp` are reachable. Until this is done, "the world is data" is aspirational.
2. **Purge lighthouse-era spec text (P2).** Rewrite `game-architecture` and `world-rules` specs
   to the actual meters (`life/warmth/signal/wreck/clock`), actual constraints, and actual
   endings. Delete or clearly mark `world_definition_spec.md` + `sample_world.json` as legacy —
   they will actively mislead a model trying to author a world. Document the *real* `world.json`
   schema.
3. **Make endings data-governed for real (P2), or change the spec to say they're code.**
   Right now the spec claims data-driven endings the engine ignores; a weaker model will "fix"
   the wrong layer. Either read `endings[].condition` or state plainly that endings are engine
   functions and the JSON is descriptive.
4. **Harden the LLM contract (P0-1, P0-2, P1-1, P1-2).** Strip `<think>`, request JSON mode,
   give the interpreter a salvage fallback, stop discarding the question-path call, and either
   restore a JSON-reliable default/validator model or document the reasoning-model limitation
   prominently. This is the single biggest reliability win.
5. **Upgrade lore retrieval (P1-3, P1-4).** Stop-word filtering + subject/object weighting +
   local dedup will make the injected context relevant, which is what makes the world feel
   consistent. If you want the "graph" to earn its name, expand candidates by one hop of edges.
6. **Fix the harness so it can actually tell you what's broken (P1-8, P1-9).** Default spine to
   offline, add the key guard + fetch timeout + correct failure taxonomy, and fill in
   `analyze.mjs`/`report.md` so `report.md` is the human-readable artifact the spec promises.
   Make `npm test` idempotent (curator should write to a temp dir in tests, or the test should
   clean up).
7. **Refresh the docs (P2).** Rewrite `shared-memory-roundtrip.md` to current file/line/flow,
   fix the README's `file://` and validator-model claims, fix the admin fallback URL, and
   archive the stale change dirs.

None of P0/P1 requires a redesign — the architecture is right. The problems are drift,
a model/parser mismatch, and an over-aggressive text cleaner. Fixing those makes the existing
design perform the way it was meant to.
