# York — The Wreck of the Meridian

A text-adventure proof of concept: a Robinson Crusoe castaway survival thriller (public
domain, 1719; echoes Cast Away). The engine owns all truth; a free LLM (OpenRouter) narrates
and proposes. Play it in plain language — Zork-style navigation, item collection, enforced
puzzles, tamed-animal companions, and procedural worldbuilding.

## Play it

Open `poc/lighthouse-nl/index.html` in any browser — no build step. Paste an OpenRouter API
key to enable natural-language interpretation; without it the built-in offline parser runs.

## Architecture: deterministic spine + LLM flesh

- **Deterministic engine** (`poc/lighthouse-nl/index.html`): a real map graph, inventory,
  life / wreck / signal / warmth meters, the Wreck's Clock, items, tamed-companion bonds,
  and win/lose conditions. Every state change flows through `applyAction()` and is validated.
- **LLM layer**: plain-language command → whitelisted OpenRouter free model → action JSON,
  validated then applied. Offline regex parser is the guaranteed floor.
- **Lore graph** (bounded memory): facts are a graph; the LLM prompt injects only top-6
  retrieved nodes. Persists to `localStorage` per world id and extends across sessions.
- **Three-tier memory** (`api/lore.js` + `scripts/curate-lore.mjs`): LOCAL (player-private)
  → SHARED (server-held, rule-validated, merged across players) → CANONICAL (`world.json`,
  human-curated only). See `openspec/README.md`.

## The world is data

All rules, map, ecology, companions, puzzles, and endings live in `openspec/world/world.json`
(the single source of truth). The POC embeds a mirror (`WORLD_DOC`) so it runs from `file://`;
re-sync the embed when you edit the JSON.

## Design docs

| File | Contents |
|---|---|
| `master_game_design_doc.md` | Engine GDD: parser-first loop, world model, MVP scope |
| `world_definition_spec.md` | World file format and content rules |
| `sample_world.json` | Example world definition |
| `openspec/world/story-analysis.md` | Public-domain survival-thriller research behind the castaway choice |

## Status

- **Engine**: the Wreck's Clock core loop + Signal vs. Conceal spine, five reachable endings.
- **Architecture**: OpenSpec functional specs + three-tier shared lore (server + curator).
- **Tests**: `scripts/test-shared-lore.mjs` (server round-trip + validation).

## Run the shared-lore tests

```bash
node scripts/test-shared-lore.mjs
```
