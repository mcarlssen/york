# Tasks — Three-Tier Shared Lore Memory

## Engine
- [x] Add `collectContributions()` to extract player-generated lore nodes
- [x] Add `validateFactClient()` mirroring server-side rule checks
- [x] Add `pushLore()` (POST to `/api/lore`) and wire a `contribute` action + UI button
- [x] Add `pullLore()` and bootstrap shared graph at `newGame` (local precedence)
- [x] Register `contribute` in `ACTION_VERB`, `applyAction`, offline parser, suggestions

## Server
- [x] Implement `api/lore.js` GET (shared graph) + POST (rule-validated merge)
- [x] KV storage with local JSON fallback for dev/test
- [x] De-dup by id and text similarity; reject forbidden ecology/identity terms

## Curator
- [x] Add `scripts/curate-lore.mjs` (diff shared vs canonical, emit OpenSpec change)
- [x] Paste-ready `candidates.lore_seed.json` output

## Spec
- [x] Add "Three-tier memory with curated canonical truth" requirement to game-architecture
- [x] OpenSpec change dir `2026-07-15-shared-lore` (proposal/design/tasks/spec delta)

## Tests / verification
- [ ] Headless test: push → merge → pull round-trip (local file fallback)
- [x] Headless test: server validation rejects forbidden ecology terms
- [ ] Headless test: duplicate/similar nodes are not double-merged
- [ ] Deploy to Vercel; confirm `/api/lore` works on KV; run curator against deployed URL

## Follow-ups (deferred)
- [ ] Player identity / moderation if shared tier sees volume
- [ ] Periodic curator runs (cron) to surface newly-merged shared facts
- [ ] Local-first conflict resolution when shared and local both evolve a node
