# Tasks

- [x] Replace flat `S.lore` with `LoreGraph` (nodes/edges, `commit`/`retrieve`)
- [x] Persist lore graph to `localStorage` per world id; load + extend across sessions
- [x] Bounded retrieval: `callLLM` injects top-6 relevant lore nodes, not a 600-char dump
- [x] Pin `LLM_MODEL`; keep offline parser as guaranteed floor; state rules precedence in prompt
- [x] Add `game-architecture` spec (engine-owns-truth, LLM interpreter, precedence, bounded memory, persistence, model pinning)
- [x] Add `world-rules` spec (world document schema + contract)
- [x] Author `openspec/world/graylight.json` with full rules + `story_gaps` TODOs for the user
- [x] Backfill change proposal `2026-07-14-lore-graph-and-specs` (proposal/design/tasks + spec deltas)
- [x] Headless-test: lore graph, persistence, retrieval, rules precedence, full solvability

## Follow-up 1 — world doc is the source of truth (DONE)

- [x] Embed `WORLD_DOC` (mirror of `graylight.json`); derive `WORLD`/`SPEC` via `buildWorld()`
- [x] `seedLore` reads `lore_seed` + `ecology` from the doc; ecology becomes retrievable lore
      (climate, terrain, flora, fauna nodes), so the LLM answers environment questions
      consistently with the committed world

## Follow-up 2 — procedural generation layer (DONE)

- [x] `genLore(text)` — LLM authors ONE consistent world fact answering a player question,
      respecting `constraints` + retrieved lore; engine commits it to the graph
- [x] `genPlace(query)` — LLM proposes a NEW map node; engine validates via `validateNewPlace`
      against the ruleset BEFORE adding (no leaving island pre-craft, no tropical ecology,
      no duplicate ids); links it back to the current node
- [x] Triggers: `examine <unknown>` and `discover`/`explore` actions; `ask` about the world
      (non-Keeper-9) flags pending generation
- [x] Headless-test: world-doc load, ecology seed, `validateNewPlace` rejects rule violations,
      place-add creates traversable node, full solvability intact

## Still deferred (not requested / out of scope)

- [ ] Vercel serverless function to hold the OpenRouter key (replace in-browser input)
- [ ] Multi-world support: `world_id` selection + per-world story_gaps
- [ ] Offline parser: handle multi-clause commands ("walk to the tower and take the key")
      — currently acts on the first clause; the LLM covers these when available
- [ ] Keep `graylight.json` and the embedded `WORLD_DOC` in sync (single source is the json;
      the HTML embeds a copy for file:// use)
