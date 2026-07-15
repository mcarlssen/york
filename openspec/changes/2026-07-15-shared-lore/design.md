# Design — Three-Tier Shared Lore Memory

## Data flow
```
LOCAL (localStorage, this player)      pullLore ─┐
                                                 ├─> newGame bootstrap (local precedence)
SHARED (KV /api/lore, all players)  <─pushLore─┘        │
        │  GET graph                                  │
        ▼                                             ▼
scripts/curate-lore.mjs  ──>  OpenSpec change  ──>  PR  ──>  CANONICAL (castaway.json)
```
- Players PROPOSE (push). Engine + /api/lore ESTABLISH shared facts. Curator promotes
  shared → canonical. The LLM never writes any tier; it only authors prose/facts the
  engine then routes through the same push path.

## Engine contract
- `collectContributions()` returns only nodes with `source ∈ {play, generated}` or tag
  `generated`. Spec-seeded baseline facts are never pushed.
- `pushLore()` POSTs to `API_BASE + "/lore"` (default `/api`; override via
  `window.YORK_API_BASE`). Client pre-filters obviously off-rules text. Non-blocking UI.
- `pullLore()` GETs and commits shared nodes that are NOT already local, tagged `shared`.
  Fired fire-and-forget at newGame; if it lands, a "fog" log line notes the count.
- `contribute` is an async action (`res.async`/`res.run`) so `playerTurn` awaits it.

## Server contract (`api/lore.js`)
- `GET ?world=<w>` → `{ world, nodes, edges, count }`.
- `POST { world, nodes:[...] }` → validates each node, merges survivors, returns
  `{ ok, merged, rejected, rejections, note }`.
- Validation: non-empty text ≤ 400 chars; no forbidden ecology/identity terms derived
  from `WORLD_DOC.constraints`; client may not claim `spec`/`shared`/`canonical` source.
- Storage: `@vercel/kv` when `kv` import succeeds (deployed); else local JSON fallback at
  `.cache/shared-lore.json` (dev/test). Same module works both ways.

## Curator contract (`scripts/curate-lore.mjs`)
- `node scripts/curate-lore.mjs [world] [--api <url>]`. Without `--api`, reads the local
  `.cache/shared-lore.json` fallback. With `--api`, GETs the deployed endpoint.
- Diffs shared `player`-source nodes against canonical `lore_seed` + ecology text (0.75
  similarity threshold). Emits an OpenSpec change under `openspec/changes/<date>-curate-...`
  with `proposal.md`, `tasks.md`, `design.md`, a `world-rules` spec delta, and a
  paste-ready `candidates.lore_seed.json`. Does NOT edit `castaway.json`.

## Rules precedence across tiers
Nothing in LOCAL, SHARED, or CANONICAL may contradict the ruleset. The engine enforces
live; /api/lore enforces statically; the curator enforces by review.
