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

### Requirement: Three-tier memory with curated canonical truth
World memory SHALL exist in three tiers that separate *open contribution* from *vetted
truth*:
1. **LOCAL** — the player's private, organic lore graph (e.g. localStorage), owned and
   extended by this player alone. Local SHALL take precedence over shared on merge.
2. **SHARED** — a server-held graph (e.g. Vercel KV via `/api/lore`) that MERGES
   player-generated lore which has passed the ruleset. New players SHALL bootstrap from
   the shared graph. Pushed nodes SHALL be rule-validated server-side before merge.
3. **CANONICAL** — the world doc in the repo (`openspec/world/<world>.json`), the single
   source of truth, modified ONLY by a human-curated change (OpenSpec PR). Players and
   the LLM SHALL NOT write it directly.

Players MAY PROPOSE (via push); only the engine + shared validator may ESTABLISH shared
facts, and only a curator may promote shared → canonical. Rules precedence is preserved
across tiers: nothing in any tier may contradict the ruleset.

#### Scenario: player pushes a discovery
- GIVEN a player has generated a world fact at play
- WHEN they trigger share/contribute
- THEN the engine pushes nodes with source in {play, generated}, the server validates them
  against the ruleset, and merges non-duplicate survivors into the shared graph

#### Scenario: new player boots
- GIVEN the shared graph contains vetted-merged facts
- WHEN a new game starts
- THEN the engine SHALL pull the shared graph and commit its nodes (tagged "shared"),
  without overwriting nodes the player already has locally

#### Scenario: shared fact is promoted to canon
- GIVEN a shared-tier fact that passed the ruleset and is not already canonical
- WHEN a curator reviews and accepts it (via scripts/curate-lore.mjs → OpenSpec change)
- THEN it is appended to the world doc's `lore_seed`; the shared graph is left intact
