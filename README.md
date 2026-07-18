# York — The Wreck of the Meridian

A text-adventure game: a Robinson Crusoe castaway survival thriller (public domain, 1719;
echoes Cast Away). The engine owns all truth; a free LLM (OpenRouter) narrates and proposes.
Play it in plain language — Zork-style navigation, item collection, enforced puzzles,
tamed-animal companions, and procedural worldbuilding.

## Play it

Open `index.html` in any browser — no build step. No key entry in the UI: the LLM is
reached through the server (`POST /api/llm`), which holds the `OPENROUTER_API_KEY`
environment variable. Without a reachable server, the built-in offline parser runs the
game entirely client-side.

## Headless playtest harness

Drive Meridian without the browser: fixture replay gate → spine / full / blind runs →
analyze → harvest → optional critic → report.

```bash
npm run harness:replay -- harness/fixtures/survive-salvage-path.json
RUNS_SPINE=1 RUNS_FULL=0 RUNS_BLIND=0 BASELINE=offline npm run harness
npm run test:harness
```

Reports land in `harness/reports/<ts>/` (`report.md` + `metrics.json`). Set
`CRITIC_ENABLED=true` for optional Player-proxy notes (never a “Fun” section). Harvest
candidates: `harness/harvest/`. Config via `.env` / env (`RUNS_*`, `BASELINE`, models, caps).

## The core loop: the Wreck's Clock

The brig Meridian is breaking up on the reef. Every turn her integrity falls. You wade out
and salvage one cargo category per trip — tools, sailcloth, provisions, rifle, radio — before
the sea takes it. That salvage is the opening pressure: greedy optimal vs. safe extraction.

Once the wreck is gone, the loop becomes SIGNAL vs. CONCEAL: a signal pyre on the cliff draws
rescue (a ship) AND predators (sharks, night hunters). Brighter signal = more of both. Around
that spine you choose how to leave — or whether to stay.

## Multiple endings (the player decides the story)

| Ending | How | Tone |
|---|---|---|
| A Sail on the Horizon | signal >= 8 + a way to be heard/seen (radio, or tamed parrot) | good |
| The Open Ocean | build a raft (tools + sailcloth + bamboo) at the cove, launch | good |
| Into the Clouds | build a balloon (sailcloth + tools), launch | bittersweet |
| The Island Is Home | survive the clock with a shelter built | bittersweet |
| The Sea Keeps You | life hits 0 | bad |

## Architecture: deterministic spine + LLM flesh

- **Deterministic engine** (`index.html`): a real map graph, inventory, life / wreck /
  signal / warmth meters, the Wreck's Clock, items, tamed-companion bonds, and win/lose
  conditions. Every state change flows through `applyAction()` and is validated.
- **LLM layer** (the flesh): plain-language command → whitelisted OpenRouter free model →
  action JSON, validated then applied. Offline regex parser is the guaranteed floor.
- **Lore graph** (bounded memory): facts are a graph; the LLM prompt injects only top-6
  retrieved nodes. Persists to `localStorage` per world id and extends across sessions.
- **Three-tier memory** (`api/lore.js` + `scripts/curate-lore.mjs`): LOCAL (player-private)
  → SHARED (server-held, rule-validated, merged across players) → CANONICAL (`world.json`,
  human-curated only).

## The world is data

All rules, map, ecology, companions, puzzles, and endings live in `openspec/world/world.json`
(the single source of truth). The engine embeds a mirror (`WORLD_DOC`) so it runs from
`file://`; re-sync the embed when you edit the JSON.

## Controls (plain language)

- `look` / `what can i see?`
- `go east` / `wade to the wreck`
- `salvage the radio` (at the Wreck Shore)
- `take the bamboo` / `eat the crab` / `drink fresh water`
- `build a raft` (cove) / `build a pyre` (cliff) / `build a shelter` (camp)
- `signal` (at the cliff, pyre built) — draws rescue AND predators
- `tame the cat` (jungle, goat meat) / `tame the parrot` (cliff, fig)
- `launch` (raft/balloon built) / `wait` (advances the clock; night drains warmth)

Enter acts, `R` restarts. Type in plain language — the server LLM interprets your words,
falling back to the offline parser when the server is unreachable. There are no on-screen
hints or suggestion pills; the island is yours to explore.

## Design docs

| File | Contents |
|---|---|
| `master_game_design_doc.md` | Engine GDD: parser-first loop, world model, MVP scope |
| `world_definition_spec.md` | World file format and content rules |
| `sample_world.json` | Example world definition |
| `openspec/world/story-analysis.md` | Public-domain survival-thriller research behind the castaway choice |
| `openspec/README.md` | Functional specs (game-architecture, world-rules) and three-tier memory |

## Shared-lore server & curator

York's world memory is a **three-tier architecture** that lets the game deepen through play
without ever letting players or the LLM overwrite the canonical truth. Lore is *openly
shared* across players, but *new world rules and vetted facts are curated*.

```
LOCAL  (localStorage, this player)      pullLore ─┐
                                                 ├─► newGame bootstrap (local precedence)
SHARED (KV /api/lore, all players)  ◄─pushLore─┘        │
        │  GET graph                                  │
        ▼                                             ▼
scripts/curate-lore.mjs ──► OpenSpec change ──► PR ──► CANONICAL (world.json)
```

- **LOCAL** — the player's private lore graph (`localStorage`), extended every session.
  Owned by this player alone; takes precedence over shared on merge.
- **SHARED** — a server-held graph (`api/lore.js`) that *merges* player-generated lore which
  has passed the ruleset. New players bootstrap from it. Players may **propose**; only the
  engine + shared validator may **establish** shared facts.
- **CANONICAL** — `openspec/world/world.json`, the single source of truth, modified **only**
  by a human-curated PR. Players and the LLM never write it directly.

Rules precedence holds in every tier: nothing may contradict the ruleset.

### How the game self-improves (the round-trip)

1. **Discovery.** As you play, the engine commits facts to your local `LoreGraph` — things
   the LLM generated (`genLore`/`genPlace`), journals you examined, places you uncovered.
   These nodes carry `source: "play"` / `"generated"` so they're distinguishable from the
   spec-seeded baseline.
2. **Contribute (push) — automatic.** Contribution is now silent and automatic: at the end
   of each session, `autoContribute()` gathers only your player-generated nodes via
   `collectContributions()`, `validateFactClient()` drops anything that obviously
   contradicts the world's ecology (e.g. tropical life on this equatorial island), then
   `pushLore()` POSTs the rest to `API_BASE + "/lore"`. `pushLore()` early-returns when there
   is nothing new, so a quiet session costs zero shared-store writes. This is non-destructive
   to your local memory and best-effort — if the server is unreachable, your local game is
   unaffected.
3. **Server validation + merge.** `api/lore.js` validates each node against the world's
   `constraints` (see below), de-duplicates by `id` and by >0.75 text similarity, tags
   survivors `source: "player"` + `"shared"`, and writes them to the shared store. The
   response reports `{ merged, rejected, rejections }` so you can see what was accepted.
4. **Bootstrap (pull).** On `newGame`, `pullLore()` GETs the shared graph and commits any
   nodes you don't already have (tagged `"shared"`). So every new player starts from a world
   that already learned from everyone who played before — the world literally grows between
   sessions, but always within the rules.

### How curation works (shared → canonical)

Shared lore is open and rule-checked, but **not** vetted for quality, tone, or narrative fit.
That human judgment is the curator's job, and it never happens automatically:

- `scripts/curate-lore.mjs [world] [--api <url>]` pulls the shared graph (from the deployed
  endpoint, or the local `.cache/shared-lore.json` fallback) and diffs its `player`-source
  nodes against the canonical `lore_seed` + `ecology` text in `world.json` (0.75 similarity
  threshold).
- For each genuinely *new* fact it writes an **OpenSpec change** under
  `openspec/changes/<date>-curate-shared-lore/` containing `proposal.md`, `tasks.md`,
  `design.md`, a `world-rules` spec delta, and a paste-ready `candidates.lore_seed.json`
  (each candidate wrapped as a `lore_seed` entry with fresh `id` and `shared`/`curated` tags).
- The curator reviews each candidate, pastes the accepted ones into `world.json`'s
  `lore_seed`, and lands the change as a PR. The shared graph is left intact — shared is the
  input, canon is the curated output. **`world.json` is never auto-edited by the script.**

This is the boundary: players and the LLM propose; the engine + validator establish shared
facts; only a curator promotes them to canon.

### One rule set, two enforcement points

There are **not** two rule sets. The `constraints` array in `world.json` is the single source
of truth, and both the engine and the server read the same document. The only difference is
*which component can enforce which part*, because they have different context:

- **The engine** (browser) holds the **live game state** — `S.flags.craftBuilt`, current
  location, inventory, meters. So it alone can enforce **stateful** rules: "you can't leave
  the island until the craft is built," "this lock needs its key in inventory," "night drains
  warmth." These depend on *what is true right now*.
- **The server** (`api/lore.js`) holds **no game state** — it only ever receives lore *facts*
  (each stored as a lore node). It cannot know whether your craft is built or where you stand.
  So it can only enforce **stateless** checks: does this fact contradict the world's fixed
  identity/ecology?

So the server is not a second rule engine. It is a **guard over lore consistency**: it stops a
player from injecting a fact that silently breaks the canon (e.g. "the island is frozen"),
because a contradictory fact is the one way shared lore can corrupt the world. It does **not**
evaluate game mechanics.

What the server actually checks on each pushed fact (stored as a lore *node*; we use
"fact" for the content and "node" for the stored record):

- the fact's text must be non-empty and ≤ 400 chars;
- the fact must **not conflict with existing canon**. This is a **semantic** check, not a
  keyword blacklist: the candidate fact is judged against the world's *established* facts
  (the `constraints`, `lore_seed`, and `ecology` from `world.json`) to see whether it
  asserts something impossible or contradictory in this world (e.g. a glacier calving into
  an equatorial lagoon) — including contradictions that use none of the obvious banned
  words. Implementation: when a server-side `OPENROUTER_API_KEY` is set, `api/lore.js` asks
  an LLM (model `LORE_VALIDATOR_MODEL`, default `openai/gpt-4o-mini`) to classify the
  candidate as `{ conflict: true|false, why }`. When no key is configured, it falls back to
  the coarse keyword heuristic, so the check still runs offline (just less precisely). A
  fact that merely adds new *consistent* detail (a new reef fish, a new tide pool) is **not**
  a conflict and is accepted.
- a client may **not** claim `spec` / `shared` / `canonical` as its `source` — those labels
  are server-assigned;
- a fact with a duplicate `id`, or whose text is > 0.75 similar (Jaccard) to an existing
  node's text, is skipped as a near-duplicate.

Stateful mechanics (craft-built, locks, night) remain the engine's job; the server only
blocks *static* lore-vs-canon contradictions.

> Note: the semantic check is **deployment configuration**, not player config. The server
> uses its own `OPENROUTER_API_KEY` (a project key you set in Vercel); the player has no key
> in the UI at all. Player LLM interpretation also goes through the server via `POST /api/llm`
> (the engine's `callLLMProxy`), so the key never ships to the client and validation cost and
> rate limits are the project's.

### Lore vs. canon world rules

Within `world.json`, two things are distinct and **both feed the game**, with rules sitting
above lore in precedence (rules always win):

- **Canon world rules** — `constraints`, `map`, `puzzles`, `endings`. The deterministic spine.
  The engine enforces these live; the LLM obeys them.
- **Lore** — `lore_seed`, `ecology`, and player-shared facts in the shared graph. The *content*
  the world is made of. Lore is consumed as facts by both the engine and the LLM, but it never
  overrides a rule.

The shared-lore server guards the boundary between these two: it keeps lore consistent with
the canon, and it never lets a lore fact become (or impersonate) a world rule.

### Storage

- **Production:** Upstash Redis (Vercel's supported Redis store after KV was sunset), key
  `york:lore:<world>` (e.g. `york:lore:meridian`). Configure via either:
  - Vercel Upstash integration: `KV_REST_API_URL` + `KV_REST_API_TOKEN` (auto-provisioned), or
  - Upstash-native: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
  (`REDIS_URL` / `KV_URL` are TCP URLs — not used by the REST client.)
- **Dev / test:** when those env vars aren't set, the function falls back to a local JSON
  file at `.cache/shared-lore.json` so the whole flow runs without a Redis instance.

### Files

- `api/lore.js` — `GET /api/lore?world=meridian` returns `{ world, nodes, edges, count }`;
  `POST /api/lore` with `{ world, nodes:[...] }` validates + merges. `POST /api/llm` with
  `{ system, user, maxTokens }` proxies the player's interpretation/world-generation calls
  through the server (key stays server-side). Upstash Redis with local fallback.
- `scripts/curate-lore.mjs` — diff shared vs canonical, emit an OpenSpec change + candidates.
- `scripts/test-shared-lore.mjs` — headless test of the push/pull/validate round-trip
  (12 assertions: empty GET, valid merge, semantic conflict + accept, ecology rejection,
  id + text de-dup, forbidden source, merged GET, /api/llm proxy, curator change).

Run the tests:

```bash
node scripts/test-shared-lore.mjs
```

## Deploy

The game is static (`index.html`). The shared-lore API needs a Vercel deployment with an
Upstash Redis database — use the integration’s `KV_REST_API_URL` + `KV_REST_API_TOKEN`, or
Upstash-native `UPSTASH_REDIS_REST_*` — and an
`OPENROUTER_API_KEY` (used for the semantic canon check *and* the player LLM proxy at
`/api/llm`). Optionally set `YORK_LLM_MODEL` to override the server-side interpretation model
(defaults to `nvidia/nemotron-3-ultra-550b-a55b:free`). `window.YORK_API_BASE` defaults to
`/api`, which works when the game and API are served from the same Vercel deployment.
