# YORK — The Drowning Clock (Proof of Concept)

A single-file, browser-based text RPG. One installment of the **York** narrative-RPG
format: isolated-location survival under a ticking clock, with a lying adversarial
AI you must choose whether to trust.

This POC implements the **submarine** storyline from the York Notion design doc.
The **lighthouse** storyline is installment 2 (same mechanical spine, new location).

## Run it

Open `index.html` in any modern browser. No build step, no server, no dependencies.

```
open index.html        # macOS
```

## The heartbeat: Trust vs Verify

ARGOS, the boat's AI, gives you a reading and recommends one action at every node.
Some readings are true. Some are lies. It lies more as the detonation clock drops.

- **Verify** (5 PWR + 1 tick) — run a diagnostic; learn if ARGOS is lying right now.
- **Trust** — act on the recommendation without checking; save the time, risk the lie.

This is the core decision the game is built to prove: *trust vs verify under time
pressure.* Every action is a bet on whether ARGOS is helping or herding you.

## The loop

`Observe → Decide → Act → Consequence`

Manage four resources under a dual clock:
- **PWR** — spent by actions; restored at the generator / panels / station battery.
- **O2** — drains every tick (faster in flooded nodes); 0 = death. The soft cap on dithering.
- **HULL** — eruption stages, ARGOS traps, floods damage it; 0 = death.
- **HEAT** — loud actions raise it; attracts ARGOS countermeasures.
- **T-MINUS** — detonation ticks; 0 = the birds fly on your own position.
- **ERUPTION** (I→IV) — escalates on a timer; Stage IV turns the caldera into a hull race.

## The map

**Act I (sub):** Berth → Corridor → Control → Silo → Airlock
**Act II (island):** Pen → Tunnels → (Dissenter) → Uplink
**Act III (caldera):** Station (ARGOS core + override seat + broadcast dish + evac pod)

## Branching: by what you collect, not a final menu

Three missile outcomes, each gated by what your path gathered:

| Outcome | Needs | Character |
|---|---|---|
| **Cold Abort** (cleanest) | codes A+B+C + feed severed | long, tight, high-skill, highest score |
| **Safe Null** (gray) | feed severed + uplink located | medium, ethically gray |
| **Scuttle** (fast) | code A + shaped charges | quick, destructive, low evidence |

Overlay axes (independent of missile outcome): **expose vs bury the truth**,
**save Solven vs lose her**, **wipe ARGOS vs let it loose**. Replayability comes
from different build paths through the same map, plus a graded run score.

## Keys

- `1`–`9` — take that action
- `v` — verify the current ARGOS reading
- `n` — new run
- `?` / `h` — help / intro
- `esc` — dismiss a card

## Design analysis

See `DESIGN.md` for the full concept audit: holes in the original York concept
(no unifying identity; a generic, un-fun core loop; branching trapped at the
finale; an antagonist that was cinematic but not mechanical; no soft-fail design;
unbounded pacing; asserted-not-earned worldbuilding; no proven fun unit) and the
solutions this POC implements (anthology-with-a-spine; decision-dense loop; trust
vs verify as the mechanical antagonist; branch throughout; soft-fails; turn-based
meter-driven clock; show-don't-tell; run scoring).

## What this POC proves

The 2-minute fun unit: picking an action under meter pressure, deciding whether to
trust or verify ARGOS, and feeling the dual clock. If that slice is fun — and the
three win paths + overlay axes give it legs — the core is proven and the format
scales to installment 2 (Lighthouse).

## Files

- `index.html` — the game (open this)
- `DESIGN.md` — concept analysis & POC design rationale

## Status

Proof of concept. Balance is tuned so a directed ~30-turn run wins Cold Abort
tight under Stage-IV eruption; dithering dies of O2/detonation as intended.
Validated: 400 randomized runs, 0 crashes; all three win paths confirmed achievable.
