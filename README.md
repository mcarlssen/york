# York

Narrative RPG / worldbuilding project. Two thriller storylines (lighthouse island, nuclear submarine) plus a modular text-adventure engine spec.

## Play the proof of concept

York ships as **installments** that share one design spine (a tension clock, resource
routing, branch-by-what-you-build, and an adversarial intelligence that corrupts your
information channel) while playing differently. Each POC lives in its own directory so
they coexist side-by-side.

| Installment | File | Mechanic | Antagonist corrupts… |
|---|---|---|---|
| **Submarine** | [poc/index.html](poc/index.html) | *The Drowning Clock* — Trust vs. Verify under a dual clock | your **data** (ARGOS lies in readings) |
| **Lighthouse** | [poc/lighthouse/index.html](poc/lighthouse/index.html) | *The Gray Light* — Illuminate vs. Conceal across storm cycles | your **senses** (Fogmind lies in sight/sound) |

- Submarine: see [poc/README.md](poc/README.md) and [poc/DESIGN.md](poc/DESIGN.md) (concept audit, design rationale).
- Lighthouse: see [poc/lighthouse/README.md](poc/lighthouse/README.md) and [poc/lighthouse/DESIGN.md](poc/lighthouse/DESIGN.md) (the eight lighthouse-native fixes, implemented).

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
- **POC:** submarine + lighthouse installments both playable in browser; submarine validates the Trust vs Verify loop, lighthouse validates the Illuminate vs Conceal storm beat
