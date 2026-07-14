# York

Narrative RPG / worldbuilding project. Two thriller storylines (lighthouse island, nuclear submarine) plus a modular text-adventure engine spec.

## Play the proof of concept

**[poc/index.html](poc/index.html)** — *The Drowning Clock*, a single-file browser text RPG implementing the submarine storyline. Open in any browser; no build step.

See [poc/README.md](poc/README.md) for controls and mechanics. See [poc/DESIGN.md](poc/DESIGN.md) for the concept audit and design rationale.

## Design docs

| File | Contents |
|---|---|
| [master_game_design_doc.md](master_game_design_doc.md) | Engine GDD: parser-first loop, world model, MVP scope |
| [world_definition_spec.md](world_definition_spec.md) | World file format and content rules |
| [sample_world.json](sample_world.json) | Example world definition |
| [story-lighthouse.md](story-lighthouse.md) | Lighthouse island narrative (Fogmind, prism shards, three endings) |
| [story-submarine.md](story-submarine.md) | Submarine narrative (ARGOS, detonation clock, three endings) |

## Status

- **Engine / world spec:** design phase
- **Narratives:** lighthouse + submarine story docs complete
- **POC:** submarine installment playable in browser; validates the Trust vs Verify loop under a dual clock
