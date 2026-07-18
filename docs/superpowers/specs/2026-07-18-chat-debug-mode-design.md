# Chat Debug Mode — Design Spec

**Date:** 2026-07-18  
**Status:** Approved  
**Problem:** Playtest / curation needs per-turn engine visibility (timestamps, LLM HTTP, lore/inv/graph side effects) without cluttering the default chat. Admin cannot see localStorage; shared push already happens on discovery — debug is for the live chat surface and copy-paste into reports.

---

## Goal

Always **record** a debug bag on each player turn. **Display** it only when a persisted Debug toggle is on. **Copy chat** includes debug only when the toggle is on; otherwise copy stays input/response lines only (current `e.t` behavior).

---

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Display | Nested under each `you` line as a collapsed `<details>` block |
| Toggle persist | `localStorage` key `york_debug_v1` (`"1"` / `"0"`) |
| Storage model | Attach `debug: { at, http[], events[] }` on the turn’s `you` log entry (Approach A) |
| Details default | Collapsed |
| Interpret lines | Stay player-facing (`llm` class); not moved into debug |

---

## Data shape

On the `you` entry for a turn:

```json
{
  "t": "> look around",
  "c": "you",
  "debug": {
    "at": "2026-07-18T12:34:56.789Z",
    "http": [
      { "route": "/api/llm", "status": "ok", "code": 200, "content": "..." }
    ],
    "events": [
      "parse: offline → look",
      "act: look",
      "lore: commit gen:12 — …",
      "inv: +fig",
      "lore: push ok merged=1"
    ]
  }
}
```

- Always written whether the toggle is on or off.
- Persists via existing game `saveState` / `S.log`.
- Older saves without `debug` simply omit the nested block.

---

## Instrumentation

| Source | What gets recorded |
|--------|-------------------|
| Turn start (`playerTurn`) | `at` ISO timestamp; bag attached to `you` entry |
| `callLLMProxy` (parse + all `createGame` llm calls) | `http[]` entry: route, status, code, raw `content` |
| Thin view after parse | `parse: llm\|offline → action…` |
| Engine `act` / gen / lore / inv / item register | `events[]` via `onDebug` callback |
| `pushLore` in thin view | `lore: push …` |

Engine gains optional `opts.onDebug(msg)` and `patchLastLog(cls, patch)`.

---

## UI

- Checkbox labeled **Debug** next to icon buttons.
- When on: under each `you` line with `debug`, render:

  ```
  ▾ debug · <ISO timestamp>
    HTTP /api/llm <code> <status>
    <content>
    · <event>
  ```

- Dim mono styling (`.dbg`). Re-render log on toggle change (no full reload).

---

## Copy

- Toggle **off:** `fullLog` newest-first, each `e.t` only (unchanged).
- Toggle **on:** same order; after each `you` with `debug`, append a plain-text debug block matching the on-screen content.

---

## Out of scope

- Console mirroring, file export, separate debug pane.
- Moving `(the voice interprets →…)` into debug.
- Truncating HTTP bodies (full content for playtest paste).

---

## Files

- `docs/superpowers/specs/2026-07-18-chat-debug-mode-design.md` — this spec
- `index.html` — toggle, turn bag, HTTP log, render, copy
- `src/engine.js` — `onDebug`, `patchLastLog`, event hooks
- `css/styling.css` / `css/layout.css` — debug block + toggle
