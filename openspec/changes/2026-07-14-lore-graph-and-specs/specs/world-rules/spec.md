# world-rules Specification (delta)

## Added Requirements

### Requirement: World is a structured document
A world SHALL be defined as JSON with sections `identity`, `constraints`, `lore_seed`,
`ecology`, `map`, `items`, `puzzles`, `endings`. The engine loads it to build state; the LLM
reads `constraints` + retrieved `lore` to stay consistent.

### Requirement: Constraints are inviolable invariants
The `constraints` array SHALL list plain-language rules the engine enforces and the LLM must
obey. The engine SHALL treat each as a hard rule.

### Requirement: Lore seed establishes baseline facts
`lore_seed` SHALL provide the initial lore-graph nodes, committed at world load and extended
by play.

### Requirement: Ecology is derived, not asserted
When asked about unknown flora/fauna/geography, the LLM SHALL consult `lore_seed`/`ecology`,
decide a consistent answer, commit it, and SHALL NOT contradict `constraints`.

### Requirement: Story is written INTO the rules
Narrative beats SHALL be expressed as committable lore facts and as `puzzles`/`endings` data,
not as prose the engine cannot enforce.

### Requirement: Endings are rule-governed
Each ending SHALL be defined by a deterministic engine-evaluated condition. The LLM SHALL
only narrate the ending the engine selects.
