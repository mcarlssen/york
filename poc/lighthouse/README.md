# YORK — The Gray Light (lighthouse POC)

A single-file browser text RPG implementing the **lighthouse-island survival thriller**
storyline. It is the companion POC to [`../index.html`](../index.html) (the submarine
installment) and lives in its own directory so the two coexist side-by-side.

Open [`index.html`](index.html) in any browser — no build step.

## The heartbeat: Illuminate vs Conceal

Light is both your tool and your beacon to the enemy. Channelling the **Beam** advances the
Seal (Contain), repels creatures, and lets you see — but it raises the next surge's fog
severity and can draw the horde. Going dark hides you and conserves power but stalls the
Seal. Every lull you re-litigate that tension.

## The loop: storm beat

Five storm cycles to the peak. Each cycle:

1. **Lull** — read the forecast (which district the next surge hits, fog severity), then
   spend a fixed power budget across Beam / Towers / Walls / Boathouse, and optionally
   scavenge one district (risky — you may be caught out).
2. **Surge** — the wave resolves against your allocation. The Fogmind may reroute the
   forecast, spawn phantom villagers that waste your ammo, or fake a breach. Breached
   districts flood and fall back to an inner perimeter (soft-fail, not death).
3. **Aftermath** — count losses, harvest lore, repair.

At the peak, the game checks your **highest** of three tracks and runs that finale.

## The three tracks (fed from turn one)

| Track | Fed by | Ending |
|---|---|---|
| **Seal** (Contain) | Beam, prism shards | reignite the lighthouse, close the rift |
| **Hull** (Escape) | Boathouse, fuel | flee by sea before the peak |
| **Bastion** (Endure) | Walls, Towers | outlast the superstorm to dawn |

A near-tie unlocks **bittersweet mixed endings**. Letting every track stall collapses the
seal at the peak — the loss state.

## Keeper-9 and the Fogmind

- **Keeper-9** gates the Beam: it stays dark until you scavenge three authorizations
  (tower / watch / crypt). Mechanical friction with a voice.
- **Fogmind** reacts to your light — brighter beam means faster Seal progress *and* higher
  fog severity *and* (when bright and unsanctified) a chance to reroute the forecast.
  Sanctifying a shard or ringing the chapel bell counter its lies; going dark blinds it.

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

## Why it exists

This POC implements the eight lighthouse-native fixes to the concept's holes — full
rationale in [`DESIGN.md`](DESIGN.md). It proves the same "York" identity as the submarine
POC while playing on a different sensory surface: the submarine's antagonist corrupts your
**data**, the lighthouse's corrupts your **senses**.

## Validation

Headless simulation of scripted strategies confirmed each track's ending is reachable and
that the economy produces wins and losses rather than one forced outcome:

- light-heavy → reignition (~73%, with over-lighting risking refuge collapse)
- hull investment → crossing (escape)
- hybrid Bastion → dawn (endure)
- idle/weak → seal collapse at the peak (loss)
- permanent dark → collapse (hiding alone loses)
