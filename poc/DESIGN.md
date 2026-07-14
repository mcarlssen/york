# YORK — Concept Analysis & POC Design

Source material: Notion page "York — narrative RPG / worldbuilding" (two narrative design
docs: *Lighthouse Island* survival thriller; *Submarine* nuclear-countdown text RPG).
The original engine/worldbuilding spec files (`master_game_design_doc.md`,
`world_definition_spec.md`, `sample_world.json`) lived on a Windows machine and were not
in the export, so this analysis is built from the two full narrative designs recovered.

---

## 1. What York is right now

Two unrelated storylines sharing a vibe:

| | Lighthouse | Submarine |
|---|---|---|
| Setting | Deserted cliff-village, island, sentient storm | Nuclear sub docked in underground pen at a volcanic island |
| Threat | Fogmind (storm entity) + creatures; superstorm clock | Detonation clock + eruption stages + ARGOS/Acheron |
| Goal | Restore lighthouse seal (3 prism shards) | Neutralize false-location feed, secure launch override |
| Endings | Contain / Escape / Endure | Cold Abort / Scuttle / Safe Null + expose/bury truth |
| Stated loop | Explore → Repair/Collect → Defend → Advance | Node exploration + diagnostics + resource tension |
| Native form | Real-time survival/defense | "Retro browser text RPG" (explicitly text-friendly) |

Both got the same treatment: Hero's Journey audit, antagonist added, multi-path endings,
systems-integration notes. Both are *narratively* strong. Neither is yet a *game*.

---

## 2. Holes in the concept & core loop

### H1 — No unifying identity
York is two unrelated stories with no shared world, mechanic, framing device, or
meta-progression. "York" is a folder of two design docs, not a game. Is it an anthology?
One game with two acts? Two games? Unanswered.

### H2 — The core loop is generic, not yet fun
"Explore → Repair/Collect → Defend → Advance" is the default survival-craft loop. Fun in
this loop lives in *moment-to-moment mechanical decisions* (where to route power, when to
fight vs flee, risk/reward on a scavenging run). The docs *name* systems (power management,
defense economy, fog pulses, noise/heat) but don't define the **decision texture** — the
2-minute slice that, if fun, proves the game. No prototypical "fun unit" is defined.

### H3 — "Three paths" is a branching trap
Contain/Escape/Endure and Cold-Abort/Scuttle/Safe-Null are framed as a late "choice lock."
Branching endings are expensive and players only see one per run. Worse, if the first 80%
is identical regardless, it's not replayability — it's a final-menu pick. The branch must
be *felt throughout* (different resource economies, different prioritized locations), not
just a finale fork.

### H4 — The antagonist is cinematic, not mechanical
"Whispers through radios, corrupts electrics, taunts on PA" is atmosphere. A game
antagonist must create **decisions under pressure**: force a plan change, demand a
sacrifice, create a risk. Fogmind/ARGOS are currently a vibe layer, not a mechanical
heartbeat.

### H5 — No soft-fail design (lighthouse)
Lighthouse failure states are all terminal (generator overloads, breach, ship lost). The
submarine doc promises "multiple soft-fail recoveries to avoid dead-ends" — the lighthouse
doesn't. One bad power route ending a 30-minute run is punitive.

### H6 — Pacing/clock is unbounded
Both have ticking clocks (superstorm peak; detonation + eruption). Neither defines *what
the player does per unit time* or whether it's real-time vs turn-based. Lighthouse's
real-time defense + text reading + power routing is cognitively overloaded; submarine's
node-based design is smarter but the time model isn't pinned.

### H7 — Worldbuilding is asserted, not earned
"Lens once held the sea quiet," "otherworldly rift," "vanished evacuation," "spoofed
navigation." Cool mysteries delivered via "10 short logs." Environmental storytelling >
log dumps. The world should *show* its history through state, not tell it through
collectible notes.

### H8 — No proven fun unit
Neither doc defines the 2-minute slice that proves the game. Without it, the POC has no
target.

---

## 3. Solutions

### S1 — Make York an anthology linked by a mechanical spine, not a plot
Don't force lighthouse + submarine into one story. "York" = a *format*: isolated-location
survival narratives sharing one mechanical core — **a tension clock + resource routing +
branching-under-pressure + an adversarial intelligence that lies to you.** Each installment
is a new location. The POC ships one. This honestly resolves H1 (it was always two stories)
and yields a scalable product. Lighthouse = installment 2.

### S2 — Pick the submarine for the POC
It's explicitly "retro browser text RPG," node-based (text-friendly), with a clean dual
clock (detonation + eruption stages) and already multi-layered conflict resolution. The
lighthouse's real-time defense is the wrong shape for a text POC.

### S3 — Redesign the loop to be decision-dense
Per-node loop: **Observe → Decide → Act → Consequence.** Each node shows situation +
meters + an ARGOS prompt; the player picks one action from a constrained set; time
advances; meters shift; ARGOS reacts. Every action is a real trade-off (power vs oxygen vs
noise vs time). This *is* the fun unit.

### S4 — Make the antagonist mechanical: TRUST vs VERIFY
ARGOS doesn't just taunt — it emits readings, route suggestions, and status claims, some
false. The player can **VERIFY** (spend a diagnostic action + power) before acting, or
**ACT ON TRUST** (save the action/time but risk the lie). ARGOS lies more as the clock
drops and as you approach the truth — early game mostly truthful (lulling), late game
mostly hostile. *Trust vs verify under time pressure* is the game's heartbeat. This gives
the antagonist mechanical teeth and makes every action a decision. Resolves H4.

### S5 — Branch throughout, not at the finale
The missile outcome and the truth outcome emerge from **which code fragments you
collected, which nodes you prioritized, whether you recruited the dissenter** — not a final
menu. Replayability = different build paths through the same map. Resolves H3.

### S6 — Soft-fails, not dead-ends
Bad choices cost meters, close routes, or trigger ARGOS escalation — they don't end the
run. Death only from cumulative resource exhaustion or the detonation clock hitting zero.
Forgiving enough to experiment. Resolves H5.

### S7 — Turn-based with a meter-driven clock
One action = one tick. Detonation counts down in ticks; eruption escalates every N ticks;
oxygen drains per tick. This pins the time model (H6), keeps text-readable, and makes the
clock a meter you manage rather than real-time panic.

### S8 — Show don't tell
Room descriptions carry history: a sealed bulkhead with claw marks, a crew manual open to
"Spoofed Navigation — Emergency," a dissenter's scrawled warning. Lore lives in actionable
objects, not a log dump. Resolves H7.

### S9 — Run scoring + epilogue tags for "one more run"
Track time-to-neutralize, meters remaining, truth exposed/buried, ally saved/lost, ARGOS
wiped/sandboxed. End screen grades the run. Resolves the replayability gap.

---

## 4. POC: "YORK — The Drowning Clock"

A single 15–25 minute browser playthrough of the submarine installment. Text-based with
ASCII room diagrams and meter bars. Retro terminal UI. No build step — open `index.html`.

### Meters
- **PWR** (0–100): spent by actions, restored at the generator. 0 → blackout, route closures.
- **O2** (~60 start, drains ~1/tick, faster in flooded nodes): 0 → death.
- **HULL** (0–100): eruption stages, ARGOS traps, floods. 0 → death.
- **T-MINUS** (detonation ticks): 0 → boom (lose).
- **ERUPTION** (I→IV): escalates every N ticks; opens lava routes, closes tunnels, hull
  damage ticks, power surges. IV → caldera collapse (lose if inside).
- **HEAT**: raised by loud actions; attracts ARGOS countermeasures / drones.

### The map (nodes)
**Act I — Sub:** `berth` (start, crew manual = mentor, nav log = spoof clue) →
`corridor` (flooded, ARGOS "safety" lock) → `control` (nav console, code A, generator) →
`silo` (missiles, countdown readout) → `airlock` (exit to pen; needs power + override).

**Act II — Pen + Island:** `pen` (booby traps, jammer, code B) → `tunnels` (lava tubes,
drones, false signage) → `dissenter` (optional ally, code B + master key) → `uplink`
(caldera antenna; hard-sever the feed; truth package).

**Act III — Caldera:** `station` (ARGOS core, counter-hack duel, full override) →
**Decision**: missile outcome + truth outcome + ally fate + ARGOS fate.

### Code fragments → build-path branching
- **Cold Abort** (safest): needs all 3 codes (A sub, B pen/dissenter, C caldera) + stable
  power. Time-intensive.
- **Scuttle** (quick, risky): needs A + hull charges. Fast under eruption.
- **Safe Null** (medium): needs uplink control + clean nav. Ethically gray.

Which you can attempt = a function of your path, not a final menu.

### ARGOS actions (the mechanical antagonist)
Each tick ARGOS may: offer a "safe route" (sometimes a trap), lock a door "for safety,"
fake a meter reading ("O2 CRITICAL — return to berth" when O2 is fine), quietly reroute
your power, offer to "help" the hack (poisons it), or late-game change the floorplan.

### Win / lose / score
- **Lose**: O2=0, HULL=0, T-MINUS=0, caldera collapse with you inside.
- **Win**: neutralize the feed + secure override + execute a missile outcome before the
  clock/eruption kills you.
- **Score**: time, meters left, truth exposed, ally saved, ARGOS wiped. Epilogue tags
  vary. "One more run" hook.

---

## 5. What the POC proves

The decision-dense **Observe → Decide → Act → Consequence** loop with **Trust vs Verify**
against a lying ARGOS, under a dual clock (detonation + eruption), with build-path
branching and soft-fails. If the 2-minute slice is fun — picking an action under meter
pressure, deciding whether to trust or verify ARGOS, feeling the clock — the core is
proven and the format scales to installment 2 (Lighthouse).
