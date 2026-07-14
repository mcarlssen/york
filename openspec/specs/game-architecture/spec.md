# game-architecture

## Purpose

Define how the York game is structured: a deterministic engine owns all truth, and a
language model (LLM) acts only as an interpreter and narrator. This spec governs the
*behavioral contract* of the system, independent of any specific engine code.

## Requirements

### Requirement: Deterministic spine owns truth
The engine SHALL be the single source of truth for game state. Map topology, inventory,
meters (life / storm / beam), locks, item ownership, puzzles, and win/lose conditions SHALL
be enforced by the engine and SHALL NOT be mutable by the LLM.

#### Scenario: LLM proposes a state change
- GIVEN the LLM returns an action that would change state
- WHEN the engine receives it
- THEN the engine validates it against current state and rules before applying, and ONLY
  `applyAction()` (or its equivalent) may mutate state

### Requirement: LLM is interpreter and narrator only
The LLM SHALL convert the player's natural-language input into an action against the fixed
action schema, answer world questions from established lore, and author prose. The LLM
SHALL NOT be trusted as the authority on state, legality, or truth.

#### Scenario: LLM is unavailable
- GIVEN no API key is set, or the model returns no usable output
- WHEN the player issues a command
- THEN the engine SHALL fall back to a built-in offline parser so the game remains fully playable

#### Scenario: LLM returns invalid JSON
- GIVEN the model output cannot be parsed into the action schema
- WHEN the engine receives it
- THEN the engine SHALL discard the LLM output and use the offline parser

### Requirement: Rules precedence over lore, prompt, and model
Whenever a conflict arises between (1) the core ruleset, (2) committed lore/memory,
(3) the player's stated intent, and (4) the LLM's output, the engine SHALL resolve in this
order, highest first:

1. Hard rules (the ruleset / engine invariants)
2. Lore/state consistency (no contradiction of committed facts)
3. Player intent (interpreted only within the above)
4. LLM prose (flavor only)

The engine SHALL reject any proposed action that violates a higher tier, even if a lower
tier appears to permit it.

#### Scenario: Lore contradicts a rule
- GIVEN a committed lore fact implies the player may bypass a lock
- WHEN the player attempts that bypass without the required key
- THEN the engine SHALL reject the action per the lock rule

### Requirement: Bounded, queryable world memory
World facts (lore) SHALL be stored as a graph of nodes and edges, not a flat growing string.
Retrieval into any LLM prompt SHALL return only the top-K nodes most relevant to the current
context (player input + location + active puzzle), so prompt context does not bloat.

#### Scenario: Many facts committed
- GIVEN hundreds of lore nodes exist
- WHEN the engine builds an LLM prompt
- THEN it SHALL inject at most K (default 6) retrieved nodes, scored by tag and token overlap

### Requirement: Memory persists and deepens across sessions
The lore graph SHALL be persisted per world id (e.g. localStorage / KV) and loaded on new
game. A new session SHALL extend the existing graph rather than reset it, so the world
deepens as the player returns.

#### Scenario: Returning player
- GIVEN a prior session committed facts F
- WHEN a new game starts in the same world
- THEN facts F SHALL be present, and new discoveries SHALL be added alongside them

### Requirement: Model selection is pinned but replaceable
The LLM model SHALL be a single configurable identifier (defaulting to the most reliable
free slug for JSON parsing). The free tier is unreliable; the offline parser is the
guaranteed floor and SHALL never be removed.
