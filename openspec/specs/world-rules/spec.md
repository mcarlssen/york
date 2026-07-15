# world-rules

## Purpose

Define the *functional* rules that govern a York world, separate from the engine and from
any specific storyline. A world is a data document the engine + LLM both read. This spec
describes the schema and the contract; the actual content lives in
`openspec/world/<world-id>.json` (see `world-rules` schema there).

The ruleset is the highest-precedence tier (see `game-architecture` → Rules precedence).
The LLM and player may only operate within it. As the game matures, the ruleset may be
adjusted or extended via change proposals; the engine always gives it precedence.

## Requirements

### Requirement: World is a structured document
A world SHALL be defined as a JSON document with the sections `identity`, `constraints`,
`lore_seed` (baseline facts), `map` (nodes + exits + locks), `items`, `puzzles`, `endings`,
and `ecology`. The engine SHALL load this document to build state; the LLM SHALL read
`constraints` + retrieved `lore` to stay consistent.

### Requirement: Constraints are inviolable invariants
The `constraints` array SHALL list plain-language rules the engine enforces and the LLM must
obey (e.g. ecology self-consistency, light-as-beacon, perception corruption, locks need
keys, no escape until craft built). The engine SHALL treat each constraint as a hard rule.

### Requirement: Lore seed establishes baseline facts
`lore_seed` SHALL provide the initial nodes of the world's lore graph (who/what/where the
world is). These SHALL be committed at world load and extended by play. The LLM SHALL use
them to answer "what kind of place is this" and to keep generated ecology consistent.

### Requirement: Ecology is derived, not asserted
When the player asks about flora/fauna/geography the LLM does not have a fact for, it SHALL
first consult `lore_seed` and `ecology`, decide a consistent answer, and (if notable) commit
it to the lore graph. The LLM SHALL NOT introduce elements that contradict `constraints`
(e.g. tropical life on a cold volcanic islet).

### Requirement: Story is written INTO the rules
Narrative beats (journals, Keeper voices, revelation moments) SHALL be expressed as
committable lore facts and as `puzzles`/`endings` data, not as prose the engine cannot
enforce. Surfacing a journal at a location is an engine action; the *content* is world data.

### Requirement: Endings are rule-governed
Each ending SHALL be defined by a deterministic condition the engine evaluates (e.g. storm
reaches peak with beam ≥ 5 → reignition). The LLM SHALL NOT decide endings; it only
narrates the one the engine selects.

## Status of the Meridian world

`openspec/world/world.json` currently encodes the POC's rules + map. 
