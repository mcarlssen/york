# Improvise Intent — Design Spec

**Date:** 2026-07-18  
**Status:** Approved  
**Branch:** `feat/improvise-intent`  
**Problem:** Crafting / assembly commands (`make a club…`, `use cloth to tie rock to driftwood`) were mis-routed to `ask`, `use`→`genEmergent`, or site `build`, so the engine never established held gear and often returned empty/fail prose (“Nothing comes of it”, “gray offers no answer”).

---

## Goal

Detect **improvise** intent (make / craft / tie / lash / bind / assemble with materials) via the LLM interpreter first, with an offline regex floor. One shot: the model **validates** whether the player has or has explained materials, then **pass/fail**. No interactive DM Q&A.

Player awareness = the validator prompt always includes inventory, visible place items, and player-state lore so the judgment (and fail message) reflects what they have or could claim.

---

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Approach | Interpreter-first (`improvise` action); offline floor |
| Materials | Must be in inv/place **or** clearly explained in this utterance (tear shirt → cloth; find vines → cord) |
| Interaction | Single-shot pass/fail — **not** multi-turn “where does X come from?” |
| Validator | LLM judges; engine applies pass or logs fail text only |
| Site builds | `build raft\|pyre\|shelter\|balloon` unchanged |

---

## Action schema

Interpreter / offline emit:

```json
{ "action": "improvise", "target": null, "item": null, "say": "<full player text>" }
```

`target` may be a short product name if the model supplies one; engine does not require it — `say` is authoritative.

---

## Validator: `genImprovise(say)`

**Inputs (materials brief):** constraints, place name, visible items, inventory, top-K lore (incl. `player`/`state` tags), recent log lines, player `say`.

**Output JSON only:**

```json
{
  "ok": true,
  "answer": "one vivid sentence",
  "result": { "id": "snake_case", "name": "display", "desc": "one line" },
  "consume": ["optional_inv_id"],
  "playerFacts": ["optional durable player-state fact"],
  "why": null
}
```

Fail:

```json
{
  "ok": false,
  "answer": "Clear in-world reason naming what’s missing or unexplained",
  "result": null,
  "consume": [],
  "playerFacts": [],
  "why": "short machine-facing reason"
}
```

**Pass rules (prompt):**

1. Every needed material is in inventory, visible at place, **or** explained in `say`.
2. Explained sources must be plausible for this equatorial castaway world (shirt→cloth strip, vines→cord, beach rock→head). No magic, no inventing wreck cargo the player didn’t salvage.
3. On pass: `result` is the finished held item; `consume` only ids actually in inventory (optional); `playerFacts` for body/clothing changes.

**Fail rules:** Missing binder/head/haft with no explanation → fail with a message that tells the player what to get or explain. Do not create items.

---

## Engine apply (`doImprovise` → `runPendingGen` / direct)

1. Call `genImprovise`.
2. **Pass:** `registerItem(result)` → push to `S.inv` (held); remove any matching ground copy; apply `consume` if present in inv; `commitLore` answer + `commitPlayerFacts`; `saveState`; `render`.
3. **Fail / empty:** `pushLog(answer || fallback)`; no inventory mutation.
4. Never use `genEmergent` for assembly (“use X to tie Y”).

---

## Routing

**`callLLM` priority (add):**

- Assembly / make / craft (non-site) / tie / lash / bind / improvise / fashion → `improvise` with `say` = full text.
- Do **not** map those to `use`, `ask`, or `salvage`.
- Site `build raft|pyre|shelter|balloon` still → `build`.

**`offlineParse` (before `use` / generic `ask`):**

- Same verb patterns → `improvise`.
- `use … to (tie|lash|bind|make|attach|affix)` → `improvise`.
- `make|craft|fashion|improvise …` → `improvise` (unless site build product).
- Compound `then` that is one craft sequence: prefer single `improvise` on the full string (don’t split into ask+use).

---

## Out of scope

- Interactive clarification turns
- Changing raft/pyre/shelter/balloon recipes
- Auto-granting materials without explanation or presence
- Playtest harness changes (optional later)

---

## Success criteria

- `make a club with the driftwood and a rock` with driftwood in inv + rock explained/at place → pass → club in inventory  
- Same without rock or binder explanation → fail message naming the gap  
- `use cloth to tie rock to driftwood` → `improvise`, not emerge “Nothing comes of it”  
- `build raft` at cove still uses site `build`
