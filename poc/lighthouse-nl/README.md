# YORK — The Wreck of the Meridian (natural-language castaway installment)

A parser-driven survival-thriller POC for the Robinson Crusoe storyline (public domain,
1719; also echoes Cast Away), built on the principle you set: the engine owns the truth, the
LLM narrates and proposes. It leans into Zork-style navigation, item collection, puzzles
with enforced solutions, tamed-animal companions, and procedural worldbuilding via a free LLM.

Open index.html in any browser — no build step.

## The core loop: the Wreck's Clock (the 2-minute fun unit)

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

- Deterministic engine (the spine). A real map graph, inventory, life / wreck / signal /
  warmth meters, the Wreck's Clock, items, tamed-companion bonds, and win/lose conditions.
  Every state change flows through applyAction() and is validated before it happens.
- LLM layer (the flesh). Plain-language command -> whitelisted OpenRouter free model
  (nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free) -> action JSON, validated then applied.
- Offline fallback. No key, or the free router returns nothing -> built-in regex parser.
- Lore graph (bounded memory). Facts are a graph; the LLM prompt injects only top-6 relevant
  nodes. Persists to localStorage per world id and extends across sessions.
- Rules precedence. Hard rules > lore/state > player intent > LLM prose.

## The world doc is canonical

All world rules, map, ecology, companions, puzzles, and endings are authored in
openspec/world/world.json. index.html embeds a copy (WORLD_DOC) so it runs from file://;
re-sync the embed when you edit the JSON. Edit world.json to author the world.

## Controls (plain language)

- look / what can i see?
- go east / wade to the wreck
- salvage the radio (at the Wreck Shore)
- take the bamboo / eat the crab / drink fresh water
- build a raft (cove) / build a pyre (cliff) / build a shelter (camp)
- signal (at the cliff, pyre built) — draws rescue AND predators
- tame the cat (jungle, goat meat) / tame the parrot (cliff, fig)
- launch (raft/balloon built) / wait (advances the clock; night drains warmth)

Enter acts, R restarts. Paste an OpenRouter key to enable LLM interpretation; without it the
offline parser runs.

## Validation

Headless engine tests confirm: the Wreck's Clock ages to 0 and is lost; salvage requires the
Wreck Shore and pulls cargo; raft, rescue, endure, and perish endings are all reachable;
taming requires the right companion-item at the right place; eating restores life.

## Relationship to the engine

This single POC is the prototype for the rules + LLM engine, bound to the Crusoe story.
The openspec/ tree holds the functional specs and the world document (world.json) that
govern it. The api/ and scripts/ directories provide the shared-lore server and curator
path (three-tier memory: local → shared → canonical).
