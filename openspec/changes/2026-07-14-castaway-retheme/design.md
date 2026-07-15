# Design: Castaway retheme

## Engine model

State (S):
- loc, life, warmth, signal, clock, wreck (the Wreck's Clock), night
- inv[], flags{}, tame{cat,parrot}, salvaged{}, visited{}, ended, endKind, log[]

Truth lives in the engine. The LLM returns an action JSON; applyAction() is the only
mutation path and validates before applying. Endings resolve in checkEnd() when:
- life <= 0 -> perish
- warmth <= 0 -> extra life drain (cascading soft-fail, not instant death)
- clock >= max -> endure (shelter) / rescue (signal+radio|parrot) / perish

## Map (castaway)

beach(start) <-> tide_pools, jungle, wreck_shore, cliff, cove, camp
- wreck_shore: salvage the Meridian (clock pressure)
- jungle: goat_meat, fig, bamboo; cat home
- spring: fresh_water
- cliff: build pyre; parrot home; signal fires here
- cove: build raft; launch
- camp: build shelter

## The Wreck's Clock

Each meaningful action ages the wreck (ageWreck). Being at the wreck_shore ages it faster.
Salvage pulls one cargo category and marks it salvaged. At integrity 0 the wreck is gone and
un-salvaged cargo is lost. This is the deterministic opening pressure.

## Signal vs. Conceal

signal raises the signal meter (cliff, pyre built) and warns the player it also draws
predators. A high signal with a way to be heard/seen (radio salvaged, or tamed parrot) ends
in rescue_ship. This is the illuminate-vs-conceal analogue and the post-wreck core loop.

## Companions (replaces Man Friday)

- jungle cat: tame at jungle with goat_meat. Once tamed, hunts (passive food) and scouts
  (warns of land predators). Mechanically: tame.cat bond meter.
- parrot: tame at cliff with fig. Once tamed, warns of ships (rescue) and predators.
  Mechanically: tame.parrot bond meter; contributes to rescue condition.

## Spec deltas

- game-architecture: note the engine now consumes a per-world WORLD_DOC and that
  castaway is the first bound world; precedence/LLM/lore unchanged.
- world-rules: castaway.json conforms to the world-rules schema (identity, constraints,
  lore_seed, ecology, map, items, companions, puzzles, endings); the schema is adequate as-is.
