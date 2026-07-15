# game-architecture Specification (delta)

## Added Requirements

### Requirement: Deterministic spine owns truth
The engine SHALL be the single source of truth for game state. Map topology, inventory,
meters (life / storm / beam), locks, item ownership, puzzles, and win/lose conditions SHALL
be enforced by the engine and SHALL NOT be mutable by the LLM.

### Requirement: LLM is interpreter and narrator only
The LLM SHALL convert natural-language input into an action against the fixed schema, answer
world questions from established lore, and author prose. It SHALL NOT be the authority on
state, legality, or truth. When unavailable or invalid, the engine SHALL fall back to a
built-in offline parser.

### Requirement: Rules precedence over lore, prompt, and model
On conflict, resolve highest-first: (1) hard rules, (2) lore/state consistency, (3) player
intent, (4) LLM prose. The engine SHALL reject any action violating a higher tier.

### Requirement: Bounded, queryable world memory
Lore SHALL be a graph of nodes/edges. Retrieval into any prompt SHALL return only top-K nodes
relevant to current context.

### Requirement: Memory persists and deepens across sessions
The lore graph SHALL persist per world id and extend (not reset) on new game.

### Requirement: Model selection is pinned but replaceable
The LLM model SHALL be a single configurable identifier; the offline parser is the guaranteed
floor and SHALL never be removed.

### Requirement: World document is the source of truth
The world's rules, map, lore seed, and ecology SHALL be defined in a single world document
(`openspec/world/<id>.json`) and loaded by the engine to derive state. The LLM SHALL read
`constraints` + retrieved lore from it to stay consistent.

### Requirement: Procedural generation is validated, not trusted
When the LLM proposes new world content (a fact, or a new map node), the engine SHALL
validate the proposal against the ruleset before committing it. A proposed place that would
violate a hard rule (e.g. leaving the island before the craft is built, or tropical ecology
on a cold islet) SHALL be rejected by the engine even if the LLM returned it. The LLM may
PROPOSE; only the engine may ESTABLISH.

#### Scenario: LLM proposes leaving the island pre-craft
- GIVEN the boathouse craft is not built
- WHEN the LLM proposes a new place that is "the mainland across open ocean"
- THEN the engine SHALL reject it per the no-escape rule

#### Scenario: LLM authors a world fact
- GIVEN the player asks about unknown ecology
- WHEN the LLM returns a single consistent fact
- THEN the engine SHALL commit it to the lore graph (retrievable thereafter)
