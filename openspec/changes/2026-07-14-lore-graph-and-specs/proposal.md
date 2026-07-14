# Proposal: Lore Graph, Session Persistence, Model Pinning & OpenSpec Functional Guidelines

## Why

The lighthouse natural-language POC (`poc/lighthouse-nl`) shipped with a naive lore store: a
flat object capped at 600 chars, dumped wholesale into every LLM prompt and reset each game.
That bloats context and loses world memory between sessions. Separately, the game's
*behavioral* contract (engine owns truth; LLM interprets; rules win) lived only inside code,
not as reviewable guidelines. This change (a) replaces the lore store with a bounded,
persistent lore graph, (b) pins a reliable free model with an offline floor, and (c) adopts
an OpenSpec-style specs tree so the functional guidelines live in the repo, separate from
the engine.

## What changes

- **Engine (`poc/lighthouse-nl/index.html`)**: `S.lore` (flat) → `LoreGraph` (nodes/edges,
  `commit`/`retrieve`). Graph persists to `localStorage` per world id and extends across
  sessions. `callLLM` injects only top-6 retrieved nodes. Model pinned to
  `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`; offline parser remains the floor.
  Prompt states explicit rules precedence.
- **Specs (`openspec/specs/`)**: new `game-architecture` and `world-rules` specs capturing
  the agreed + implicit decisions.
- **World data (`openspec/world/graylight.json`)**: the Gray Light rules document, with
  explicit `story_gaps` TODOs for the user to fill.

## Decisions backfilled (agreed + implicit)

- Agreed: engine owns truth, LLM narrates; puzzle integrity is deterministic; Keeper lore is
  core story; world spec governs LLM generation; rules always win over lore/prompt.
- Implicit (made during build, now recorded): offline regex parser is the guaranteed floor;
  free tier is unreliable so model is pinned-but-replaceable; lore retrieval bounded to K=6;
  memory persists per world id and extends rather than resets.

## Impact

No engine behavior changed for the player except correctness/depth: lore is now queryable,
persistent, and bounded. All four POC win/loss paths remain solvable (verified headlessly).
