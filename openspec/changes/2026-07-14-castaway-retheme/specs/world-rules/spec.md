# World Rules spec — delta for castaway

The world-rules schema (identity, constraints, lore_seed, ecology, map, items, companions,
puzzles, endings) is adequate. This change adds `openspec/world/castaway.json` as a
conforming world document and binds it to the engine.

## Requirements

- WR-1: The engine MUST load a world document and derive WORLD + SPEC from it (no world
  facts hardcoded outside the doc). The embedded WORLD_DOC in index.html MUST mirror the
  canonical openspec/world/castaway.json.
- WR-2: `constraints` are the inviolable invariants the engine and LLM obey (ecology
  consistency, Signal-vs-Conceal, Wreck's Clock, night/warmth, no-escape-until-craft).
- WR-3: `lore_seed` + `ecology` seed the persistent lore graph at first play and are
  idempotent across sessions.
- WR-4: `endings` declare their win/lose conditions; the engine's checkEnd() MUST implement
  exactly those conditions. Precedence: hard rules > lore/state > player intent > LLM prose.
- WR-5: Man Friday is omitted; companions are the jungle cat and parrot, each with a
  home node and a tame_item, per the constraints.

## Notes

- castaway.json is now the single canonical world doc. The prior graylight.json (lighthouse)
  is superseded by this retheme and removed to avoid two canonical sources.
