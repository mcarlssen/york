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

## Follow-ups (not in this change)

- [ ] Wire `ecology` + richer `lore_seed` from `graylight.json` into `seedLore`/retrieval
- [ ] Let the LLM *generate* new map nodes/ecology from the committed lore (procedural layer)
- [ ] Vercel serverless function to hold the OpenRouter key (replace in-browser input)
- [ ] Multi-world support: `world_id` selection + per-world story_gaps
