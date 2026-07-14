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
    graylight.json           # Gray Light rules doc; fill `story_gaps` to author the start
  changes/                   # change proposals with spec deltas
    2026-07-14-lore-graph-and-specs/
```

## Three layers, kept apart

1. **Engine** (`poc/*/index.html`) — the code. Deterministic state, parser, UI.
2. **Specs** (`openspec/specs/`) — the behavioral contract. What the engine + LLM must do.
   Reviewable without reading code.
3. **World** (`openspec/world/*.json`) — the content. Constraints, map, lore seed, puzzles,
   endings, and the story you write. Loaded by the engine; read by the LLM.

## Authoring a world (for the user)

Open `openspec/world/graylight.json`. The schema is self-describing; the `story_gaps`
section is a checklist of starting-world-story questions to answer (origin of the rift, the
first/last keeper, Keeper-9's nature, the island's kind, etc.). Fill those in; the engine
will surface them through journals and the LLM will stay consistent with them via the
`constraints` + `lore_seed` it reads.

## Making a change

Describe the change, create `openspec/changes/<id>/{proposal.md,design.md,tasks.md,specs/.../spec.md}`
with the spec deltas, implement in the engine, then fold the delta into `openspec/specs/`.
