# Proposal: Retheme Gray Light -> The Wreck of the Meridian (Crusoe castaway)

## Why

The lighthouse/keeper world was a useful prototype, but the user chose Robinson Crusoe
(public domain, 1719; echoes Cast Away) as the stronger survival-thriller fit: the initial
salvage bounty has time pressure, food/night tension is built in, and after the wreck is
looted the player has multiple credible escape paths (sailboat, signal fire, balloon,
radio). The Man Friday human plotline is omitted (problematic) and replaced by tamed
wildlife companions (jungle cat, parrot). The core "illuminate vs. conceal" mechanic becomes
"Signal vs. Conceal" — a signal pyre draws rescue AND predators.

## What changes

- World doc: new openspec/world/castaway.json (canonical) replaces the lighthouse
  graylight.json as the authored source of truth. Full Crusoe lore, equatorial ecology,
  island map, companions, puzzles, and five endings.
- Engine (poc/lighthouse-nl/index.html): WORLD_DOC re-embedded from castaway.json. New
  meters (wreck, signal, warmth, clock, tamed-companion bonds). New actions: salvage (the
  Wreck's Clock), signal, tame, build (raft/pyre/shelter/balloon), eat/drink. Endings
  reworked to the five Crusoe outcomes. The lore graph, persistence, bounded retrieval,
  model pinning, and rules precedence from the prior milestone are kept.
- OpenSpec: this change + spec deltas; story-analysis.md records the PD research and
  loop-mechanic derivation that motivated the choice.

## Decisions (from user)

- Scope: retheme in place (replace lighthouse with castaway), not a second world.
- Core loop: the Wreck's Clock.
- Companions: both jungle cat and parrot.
- castaway.json is canonical; index.html embeds/mirrors it.

## Impact

All five endings reachable and engine-tested headlessly. No shared files (submarine /
lighthouse POCs) touched. The functional specs (game-architecture, world-rules) are
unchanged in principle; this change adds the castaway world content and reworks the engine
to consume it.
