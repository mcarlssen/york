# YORK — The Gray Light · Lighthouse POC Design

A playable proof-of-concept of the **lighthouse-island survival thriller** storyline,
built as a single-file browser text RPG. It implements the eight direct fixes to the
lighthouse concept's holes (see `../DESIGN.md` for the full audit; this POC targets the
lighthouse installment specifically).

The through-line, carried over from the submarine POC: the submarine's antagonist
corrupts your **data**; the lighthouse's corrupts your **senses**. That difference is
what drives a *different* heartbeat — and proves the installments share one identity
(a format) while playing completely differently.

## The lighthouse heartbeat: Illuminate vs Conceal

The theme already in the source doc — *Light vs Lure: beacon as salvation or bait* —
becomes the mechanical spine. **Light is both your tool and your beacon to the enemy.**
Every point of Beam power you channel lets you see through fog, repels creatures in its
cone, and advances the **Seal** — but it raises the fog severity of the next surge and
draws the horde. Going dark hides you and conserves power but stalls the Seal. That
single tension is the 2-minute decision you make every lull. It is the Trust-vs-Verify
equivalent, earned mechanically instead of stated.

## H1 — No unifying identity → York is a format

Same spine across installments: a visible tension clock, resource routing, branch-by-what-
you-build, and an adversarial intelligence that **corrupts your information channel**. Sub =
data (ARGOS lies in readings). Lighthouse = perception (Fogmind lies in sight/sound). The
lighthouse is the flagship installment; submarine is installment 2.

## H2 — Generic loop → the "storm beat"

The loop is a phased **storm cycle** with decision texture:

- **Lull** — you get a *forecast* (which district the next surge hits, fog severity).
  Allocate a fixed power budget across Beam / Towers / Walls / Boathouse. Scavenge one
  district (risk: caught out when the surge lands).
- **Surge** — the wave resolves against your allocation. Fog pulses reroute the forecast;
  creatures test your weakest gate.
- **Aftermath** — count losses, harvest lore from what happened, repair or fall back.

The fun unit is **power allocation under a directional forecast, with the light-attracts
tax.**

## H3 — "Three paths" is a branching trap → three tracks fed from turn one

Contain / Escape / Endure are three **meters** you raise by where you invest every cycle:

| Track | Fed by | Ending |
|---|---|---|
| **Seal** (Contain) | Beam channel, prism shards, lens calibration | reignite the lighthouse, close the rift |
| **Hull** (Escape) | Boathouse, fuel, hull repair | flee by sea before the peak |
| **Bastion** (Endure) | Walls / Towers, scrap, flares | outlast the superstorm to dawn |

At the peak the game checks your **highest** track and runs that finale. A near-tie
(unless one track dominates by >12 and is ≥40) unlocks **bittersweet mixed endings**. The
branch is felt across the whole run, not picked at the end.

## H4 — Antagonist cinematic → mechanical (Fogmind + Keeper-9)

- **Fogmind reacts to your light.** Brighter beam = faster Seal progress *and* higher
  fog severity *and* (when bright and unsanctified) a chance to **reroute the forecast**
  onto an unprepared district.
- **Fog pulses corrupt information:** hide/reroute the forecast, spawn **phantom villagers**
  that bait your towers into wasting ammo, fake a breach. Countered by going dark,
  sanctifying a shard, or ringing the chapel bell — trade-offs, not free.
- **Keeper-9** gates the Beam: it withholds authorization until you gather three tokens
  (tower / watch / crypt) via scavenging. Mechanical friction with a voice.

## H5 — No soft-fail → degrade, don't end

Failures cascade instead of killing:

- Breached district → it **floods** (lose its scavenge + tower) but you fall back to an
  inner perimeter.
- Caught-out scavenging → extra refuge damage, not death.
- Refuge only hits 0 if breaches pile up across cycles; the Seal collapses at the peak
  only if no track matured.

Retreat (go dark, fall back) is always available, so experimentation is safe.

## H6 — Unbounded clock → fixed, phase-based cycles

The superstorm is **5 storm cycles** to the peak, always visible as "Cycle N/5". Each
cycle is the Lull → Surge → Aftermath loop above. **Turn/phase-based, not real-time** —
this removes the cognitive overload of simultaneous defense + reading + power juggling
and reads cleanly as text.

## H7 — Worldbuilding asserted → earned through state

The world tells its history by how it reacts:

- Phantom villagers re-enact the evacuation near the harbor (bait mechanic) — you watch
  it happen.
- Guard towers, prism shards, the chapel bell, and the crossed-out evac list are *objects
  the mechanics surface*, not collectible logs you read.
- The Drowned Matriarch / rift reveal is **earned** by aligning the lens (raising Seal),
  not narrated up front.

## H8 — No proven fun unit → named and built to it

The provable slice implemented here: **one storm beat** — read the forecast, spend the
power budget across the four sinks under the Illuminate-vs-Conceal tension, survive the
surge, live with the consequence. The tracks (H3) and reactive Fogmind (H4) add depth and
replayability on top of that slice.

## Controls

| Key | Action |
|---|---|
| `1` | Channel the Beam (once Keeper-9 authorizes) |
| `2` | Man the Towers (+Bastion, +ammo) |
| `3` | Reinforce the Walls (+Bastion) |
| `4` | Work the Boathouse (+Hull, +fuel) |
| `5`–`9` | Scavenge an intact district (risky) |
| `S` | Sanctify a prism shard (dulls fog lies) |
| `B` | Ring the chapel bell (rout phantom villagers) |
| `D` | Go dark this cycle (conceal, conserve) |
| `Enter` | Ride out the surge → aftermath |
| `R` | Restart |

## How it was validated

The same headless-simulation approach used for the submarine POC was applied: the game
logic was exercised in Node with scripted strategies (light-heavy, dark-turtle, balanced,
scavenge-rush) to confirm each of the seven endings is reachable and that the refuge/Seal
economy produces wins and losses rather than one guaranteed outcome.
