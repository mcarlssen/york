# game-architecture — spec delta (ADDED)

## ADDED Requirements

### Requirement: Three-tier memory with curated canonical truth
World memory SHALL exist in three tiers that separate *open contribution* from *vetted
truth*: LOCAL (player-private graph), SHARED (server-held, rule-validated, merged across
players), and CANONICAL (repo world doc, human-curated only). Players may propose; only
the engine + shared validator may establish shared facts; only a curator may promote
shared → canonical. Nothing in any tier may contradict the ruleset.

#### Scenario: player pushes a discovery
- GIVEN a player generated a world fact at play
- WHEN they trigger contribute
- THEN the engine pushes nodes with source in {play, generated}, the server validates them
  against the ruleset, and merges non-duplicate survivors into the shared graph

#### Scenario: new player boots
- GIVEN the shared graph has merged facts
- WHEN a new game starts
- THEN the engine pulls the shared graph and commits its nodes (tagged "shared") without
  overwriting locally-present nodes

#### Scenario: shared fact is promoted to canon
- GIVEN a shared-tier fact that passed the ruleset and is not already canonical
- WHEN a curator reviews and accepts it via the curator script + OpenSpec change
- THEN it is appended to the world doc's lore_seed; the shared graph is left intact
