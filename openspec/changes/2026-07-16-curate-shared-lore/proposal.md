# Curate Shared Lore → Canon (meridian)

Date: 2026-07-16
World: meridian (The Wreck of the Meridian)

## Why
The SHARED tier (api/lore.js) accumulates player-generated lore that has passed
the ruleset. It is open and rule-checked but NOT vetted for quality, tone, or
narrative fit. Canonical world truth must remain human-curated. This change
proposes promoting the candidate facts below into `world.json`'s `lore_seed`
after curator review.

## Candidates (copied from shared graph — REVIEW before merging)
1. [generated,lore,shared] the jungle interior hides a fallen survival cache

## Process
1. Curator reviews each candidate; rejects duplicates, low-quality, or off-tone facts.
2. Accepted facts are appended to `lore_seed` in `openspec/world/world.json`
   with a fresh `id` and appropriate `tags`.
3. This change is merged via PR; the shared graph is left intact (shared is the
   input, canon is the curated output — they do not collide).

## Boundary upheld
Players and the LLM never write the canonical doc. Only this curator flow does.
