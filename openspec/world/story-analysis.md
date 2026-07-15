# Story analysis — survival-thriller PD anchors & core-loop derivation

Source research for choosing the castaway world that now binds the Meridian engine.

## Public-domain survival-thrillers considered

| Book | PD | Hero's Journey (abridged) | Why / why not |
|---|---|---|---|
| Robinson Crusoe (Defoe, 1719) | yes | restless departure -> wreck -> salvage -> mastery of the island -> companion (Man Friday) -> rescue/self-sufficiency | CHOSEN. Salvage-with-time-pressure + food/night tension + many escape paths. |
| The Swiss Family Robinson (Wyss, 1812) | yes | family shipwreck -> salvage -> build a treehouse civilization -> rescue | Strong but lighter tone; family unit less lone-survivor. |
| The Call of the Wild (London, 1903) | yes | domestic dog -> kidnapped -> brutal journey -> primal mastery -> answers the wild | Great antagonist (the wild) but player-as-dog is a stretch for this engine. |
| The Lost World (Doyle, 1912) | yes | expedition -> plateau -> dinosaurs -> escape | Exploration-heavy; less "survive with nothing" pressure. |

## Why Crusoe won (user's words)

- Initial scavenge bounty has time pressure (the wreck is breaking up).
- Food/night tension is built into the situation.
- After the wreck is looted, multiple credible ways to survive/escape: build a sailboat,
  survive indefinitely, build a giant signal fire, construct a hot-air balloon, salvage a
  radio and hope to contact a ship/plane.
- Island + ocean wildlife is a convincing antagonist.
- Man Friday human plotline omitted (problematic) -> adapted to wildlife (jungle cat,
  parrot), both useful once domesticated. Loosely follows Cast Away.

## 2-minute fun unit (core loop) candidates

1. Wreck's Clock (CHOSEN): salvage cargo before the sea takes it. Pressure + greed/optimal
   tension. Maps to "illuminate vs. conceal" as SIGNAL vs. CONCEAL afterwards.
2. Fire vs. Night: keep warm / keep a signal; night drops warmth.
3. Signal vs. Exposure: be seen by rescue or by predators.
4. Tame the Companion: bond vs. wild (cat hunts/scouts, parrot warns).

The chosen build layers 1 (opening) -> 3/2 (midgame spine) -> 4 (companion texture) and lets
the player pick the ending. See world.json for the bound implementation.
