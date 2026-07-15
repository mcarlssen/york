# Three-Tier Shared Lore Memory

Date: 2026-07-15
Worlds affected: castaway (and any future world)

## Why
Player-generated lore was trapped in `localStorage`: each player's discoveries were
private and the world never evolved past the canonical seed. The goal is a world that
*deepens through play* without sacrificing the two guardrails we already agreed on —
rules precedence, and a canonical source of truth that is human-curated (not crowd-written).

This change introduces the third memory tier (SHARED) and the curator path (SHARED →
CANONICAL), completing the three-tier architecture: LOCAL (private), SHARED (open,
rule-validated, merged), CANONICAL (curated PR). Lore is openly shared; new world RULES
and vetted facts are curated.

## What changed
- **Engine (`poc/lighthouse-nl/index.html`)**: added `collectContributions()`, `pushLore()`,
  `pullLore()`, `validateFactClient()`, and a `contribute` action + UI button. New games
  bootstrap from the shared graph (best-effort; offline floor = local + spec seed).
  Push/pull are non-destructive to local memory and never contact the canonical doc.
- **Vercel function (`api/lore.js`)**: `GET /api/lore?world=<w>` returns the shared graph;
  `POST /api/lore` validates each node against the world's constraints and merges
  non-duplicate survivors. Backed by `@vercel/kv` when deployed, with a local-file
  fallback (`.cache/shared-lore.json`) so it runs in dev without a KV binding.
- **Curator script (`scripts/curate-lore.mjs`)**: pulls the shared graph, diffs against the
  canonical `lore_seed`/ecology, and writes an OpenSpec change with copy-paste candidate
  facts. Curators review and land via PR — the canonical doc is never auto-edited.
- **Spec**: added the "Three-tier memory with curated canonical truth" requirement to
  `game-architecture`.

## Decisions (backfilled / explicit)
- Shared is the only open tier; canonical is write-protected from players and the LLM.
- Server-side validation reuses the same ruleset logic the engine uses (constraints-derived
  forbidden terms). Stateful rules (e.g. cannot leave until craft built) stay live in the
  engine; the server only blocks static ecology/identity contradictions.
- De-dup by id OR >0.75 text similarity prevents the shared graph from flooding with
  near-duplicates.

## Out of scope
- Auto-promotion of shared → canonical (must stay human-curated).
- Player identity / moderation / abuse tooling (future work if shared sees volume).
