# OpenSpec — York functional guidelines

This directory holds York's **functional specifications**, kept separate from the engine
code and from the world's story content. The model is borrowed from
[OpenSpec](https://openspec.dev/): specs live in the repo as living behavioral contracts;
changes are proposals with spec deltas.

## Layout

```
openspec/
  specs/                     # capability specs (how the game BEHAVES)
    game-architecture/       # engine-owns-truth, LLM interpreter, rules precedence, memory
    world-rules/             # schema + contract for world documents
  world/                     # world data (the STORY, written into the rules)
    world.json              # The Wreck of the Meridian — active castaway POC world doc (canonical)
  changes/                   # change proposals with spec deltas
    2026-07-14-lore-graph-and-specs/
    2026-07-15-shared-lore/   # three-tier shared memory (local / shared / canonical)
```

## Three layers, kept apart

1. **Engine** (`poc/*/index.html`) — the code. Deterministic state, parser, UI.
2. **Specs** (`openspec/specs/`) — the behavioral contract. What the engine + LLM must do.
   Reviewable without reading code.
3. **World** (`openspec/world/*.json`) — the content. Constraints, map, lore seed, puzzles,
   endings, and the story you write. Loaded by the engine; read by the LLM.

## Three-tier memory (lore that deepens through play)

World lore lives in three tiers, separating **open contribution** from **vetted truth**:

- **LOCAL** — the player's private lore graph (`localStorage`), extended each session.
- **SHARED** — server-held, rule-validated, merged across all players (`api/lore.js`, KV).
  New players bootstrap from it. Players **propose**; the engine + validator **establish**.
- **CANONICAL** — `openspec/world/*.json`, the single source of truth, changed **only** by a
  human-curated PR. Players and the LLM never write it.

Promotion path: `pull/push` at play → `scripts/curate-lore.mjs` diffs shared vs canonical
and opens an OpenSpec change → curator reviews and lands the PR. Rules precedence holds in
every tier.

## Authoring a world (for the user)

Open `openspec/world/world.json`. The schema is self-describing; the `story_gaps`
section is a checklist of starting-world-story questions to answer (why the Meridian sailed,
the cat's name, what the radio carried, the island's history, etc.). Fill those in; the
engine will surface them through journals and the LLM will stay consistent with them via the
`constraints` + `lore_seed` it reads.

## Making a change

Describe the change, create `openspec/changes/<id>/{proposal.md,design.md,tasks.md,specs/.../spec.md}`
with the spec deltas, implement in the engine, then fold the delta into `openspec/specs/`.
