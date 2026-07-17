# World Rules — spec delta (proposed)

## ADDED Requirements

### Requirement: Curated promotion of shared lore
The canonical world doc is the single source of truth and MUST only be modified
through a human-curated change (OpenSpec PR). Player-contributed lore from the
shared tier MAY be promoted into `lore_seed` only after curator review, never
automatically.

#### Scenario: shared fact is promoted
- GIVEN a shared-tier fact that passes the ruleset and is not already in canon
- WHEN the curator reviews and accepts it
- THEN it is appended to `lore_seed` with a fresh id and tags, and the change is
  landed via PR.

#### Scenario: shared fact is rejected
- GIVEN a shared-tier fact that is low-quality, off-tone, or duplicative
- WHEN the curator rejects it
- THEN it is NOT added to canon and the shared graph retains it unchanged.
