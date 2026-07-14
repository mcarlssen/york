# Design: Lore Graph & Functional Specs

## Lore graph (replaces flat `S.lore`)

- Node: `{ id, subject, relation, object, text, source, tags[], turn }`.
- Edge: `{ from, to, rel:"related" }` — used for future traversal; retrieval today is
  scored by tag overlap + token overlap, not graph walking.
- `commit(subject, relation, object, opts)` — opts carry `id` (stable, for journals so
  re-reads don't duplicate) and `tags`.
- `retrieve(query, k)` — scores every node by token overlap with the query plus a +2 boost
  per matching tag; returns top-K. Bounds prompt context.

## Persistence

- Keyed `york_lore_v1:<world_id>` in `localStorage`. Serializes `{nodes, edges, seq}`.
- On `newGame`: `loadLore()` restores the graph if present, else `new LoreGraph()`.
  `seedLore()` then adds any *absent* baseline nodes (idempotent). So returning sessions
  extend the graph; the seed never overwrites player discoveries.

## Model pinning + precedence

- `LLM_MODEL = nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` — most reliable free slug
  for JSON action parsing (per the model sweep; the free tier rotates, re-validate before
  shipping). It is a reasoning model: `extractJSON` strips the `reasoning` block by taking
  the first `{...}` span.
- Offline parser (`offlineParse`) is the guaranteed floor: if no key, or model returns null/
  unparseable, the engine uses regex interpretation. The game is always playable.
- Precedence encoded both in the prompt ("RULES PRECEDENCE — you MUST obey these") and, more
  importantly, in code: `applyAction` validates against locks/inventory/win-conditions before
  any LLM prose can matter.

## OpenSpec layout

```
openspec/specs/game-architecture/spec.md   # engine-vs-LLM contract, precedence, memory
openspec/specs/world-rules/spec.md         # schema + contract for world documents
openspec/world/graylight.json              # the Gray Light rules doc (user fills story_gaps)
openspec/changes/<id>/{proposal,design,tasks}.md + specs/ deltas
```

This keeps "how the game behaves" (specs) separate from "how it's built" (engine code) and
from "what the story is" (world json).
