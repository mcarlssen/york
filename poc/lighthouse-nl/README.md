# YORK — Gray Light (natural-language installment)

A parser-driven survival-exploration POC for the **lighthouse-island** storyline, built on
the principle you set: **the engine owns the truth, the LLM narrates and proposes.** This is
a different animal from the earlier allocation-loop POC (`../lighthouse/`) — it leans into
Zork-style navigation, item collection, puzzles with enforced solutions, Keeper lore, and
procedural worldbuilding via a free LLM.

Open [`index.html`](index.html) in any browser — no build step.

## Architecture: deterministic spine + LLM flesh

- **Deterministic engine (the spine).** A real map graph, inventory, `life` / `storm` /
  `beam` meters, locked connections, items, keeper journals, and win/lose conditions. Every
  state change flows through `applyAction()` and is validated before it happens. The LLM
  never mutates state directly.
- **LLM layer (the flesh).** Your plain-language command is sent to `openrouter/free`, which
  returns an *action JSON* (`go` / `take` / `examine` / `read` / `use` / `ask` / `build` /
  `launch` / `look` / `wait`). That JSON is validated against the engine, then applied. The
  LLM also answers world questions and authors prose.
- **Offline fallback.** If no key is set, or the free router picks a model that returns
  nothing (it sometimes does — e.g. a content-safety model), the game silently falls back to
  a built-in regex parser. **The spine always works.** In testing, the LLM returned usable
  JSON on roughly half of calls and `null` on the rest; the fallback covered the gaps with
  zero breakage.

## The world spec (rules the LLM must respect)

Lives in `SPEC` at the top of `index.html`. It is a small design document:

```js
const SPEC = {
  seed: "Gray Light: a volcanic basalt islet in a vast, cold ocean, besieged by a
         sentient storm called the Fogmind. You are the newest keeper of its
         lighthouse; the last keeper is missing.",
  constraints: [ /* ecology self-consistency, light-as-beacon, Fogmind corrupts
                   perception, keepers are a lineage, time costs, locks need keys,
                   no leaving until the craft is built... */ ],
  lore: {} // committed facts; the LLM appends here as the world is established
};
```

This is exactly the "rules by which the world is governed" you described. The LLM is given
the constraints and the current committed lore with every call, so its proposals stay
consistent and it can grow the lore (e.g. establishing what *kind* of island this is and
keeping that in memory).

## The map (Zork-style)

```
beach ──north── cliff_path ──north── tower_base ──up── lamp_room
  │               │  │  │                │
 west           east │  in(LOCKED)    south_west
  │               │   │   │            │
tide_pools    watch_post  storm_cellar  boathouse
                │
              east
                │
             chapel ──down── crypt
```

Puzzles with enforced solutions:

- The **storm cellar** is locked; you must find the **iron key** (tide pools) before travel
  is allowed. The engine rejects entry otherwise.
- Inside the cellar, **take the lever**, then **use it** to feed the lamp.
- In the **lamp room**, **raise the beam** (only works once the lever is pulled).
- **Reignition** (win): reach `storm == 12` (the peak) with `beam >= 5`.
- **Crossing** (win): collect the **prism shard** (chapel) + pull the lever, **build** the
  craft in the boathouse, then **launch**.
- **Collapse / drown** (loss): peak with `beam < 5`, or `life` hits 0.

## Keeper lore as the core story

Four keeper journals are scattered through the map (`j_what`, `j_tele`, `j_echo`, `j_fog`).
Reading one commits its text to the run's lore memory and surfaces it in Keeper-9's answers.
Keeper-9 itself is the *voice of the institution* — it answers questions about the last
keeper, the Fogmind, the beam, and escape, drawn from established lore and state.

## Controls

Type in plain language. Examples:

- `look` / `what can I see?`
- `walk north` / `go into the storm cellar`
- `take the iron key`
- `examine the journal` / `read it`
- `ask Keeper-9 what happened to the last keeper`
- `pull the lever` / `raise the beam`
- `build the craft` / `launch`

<kbd>Enter</kbd> acts · <kbd>R</kbd> restarts.

Paste an OpenRouter key in the box at the top to enable LLM interpretation; without it the
offline parser runs. (Per the deployment plan: for Vercel, this key input is replaced by a
serverless function that holds the key, so it never ships to the client.)

## Validation

The deterministic engine is unit-tested headlessly (`test` harness):

- locked cellar rejects entry without the key
- reignition path is solvable (key → cellar → lever → beam → peak)
- crossing path is solvable (prism + lever → build → launch)
- building is rejected without the prism
- idle play collapses at the peak
- offline parser routes `examine journal` → `read`, and resolves directions

## Relationship to the other POCs

| File | Style |
|---|---|
| [`../index.html`](../index.html) | Submarine — Trust vs. Verify, dual clock |
| [`../lighthouse/index.html`](../lighthouse/index.html) | Lighthouse — Illuminate vs. Conceal, allocation loop |
| [`index.html`](index.html) | Lighthouse — **natural-language**, Zork-style exploration + LLM flesh |

This installment is the prototype for the "rules + LLM" direction: a thin deterministic
spine, a world spec the model reasons against, and Keeper lore as the story.
