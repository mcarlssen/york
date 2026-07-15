# York — The Wreck of the Meridian

A text-adventure game: a Robinson Crusoe castaway survival thriller (public domain, 1719;
echoes Cast Away). The engine owns all truth; a free LLM (OpenRouter) narrates and proposes.
Play it in plain language — Zork-style navigation, item collection, enforced puzzles,
tamed-animal companions, and procedural worldbuilding.

## Play it

Open `index.html` in any browser — no build step. Paste an OpenRouter API key to enable
natural-language interpretation; without it the built-in offline parser runs.

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

Enter acts, `R` restarts. Paste an OpenRouter key to enable LLM interpretation; without it the
offline parser runs.

## Design docs

| File | Contents |
|---|---|
| `master_game_design_doc.md` | Engine GDD: parser-first loop, world model, MVP scope |
| `world_definition_spec.md` | World file format and content rules |
| `sample_world.json` | Example world definition |
| `openspec/world/story-analysis.md` | Public-domain survival-thriller research behind the castaway choice |
| `openspec/README.md` | Functional specs (game-architecture, world-rules) and three-tier memory |

## Shared-lore server & curator

- `api/lore.js` — Vercel serverless function: `GET /api/lore?world=meridian` returns the
  shared graph; `POST /api/lore` rule-validates and merges player lore. Backed by Vercel KV,
  with a local JSON fallback for dev.
- `scripts/curate-lore.mjs` — diffs the shared graph against `world.json` and writes an
  OpenSpec change with paste-ready candidates. The canonical doc is never auto-edited.
- `scripts/test-shared-lore.mjs` — headless test of the push/pull/validate round-trip.

Run the tests:

```bash
node scripts/test-shared-lore.mjs
```

## Deploy

The game is static (`index.html`). The shared-lore API needs a Vercel deployment with a
`VERCEL_KV_*` binding and `window.YORK_API_BASE` pointed at the deployed URL in `index.html`.
