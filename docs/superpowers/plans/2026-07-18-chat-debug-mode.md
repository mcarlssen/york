# Chat Debug Mode — Implementation Plan

> **For Claude:** implement task-by-task. Spec: `docs/superpowers/specs/2026-07-18-chat-debug-mode-design.md`

**Goal:** Persist-debug toggle; always record per-turn debug on `you` log entries; show/copy only when on.

**Files:** `src/engine.js`, `index.html`, `css/styling.css`, `css/layout.css`, spec (done).

## Task 1: Engine hooks

- `opts.onDebug(msg)`; `debugEvent` from `commitLore`, inv pushes, `registerItem`, `act`, genStep milestones
- Export `patchLastLog(cls, patch)`

## Task 2: Thin view

- Debug checkbox + `york_debug_v1`
- `turnDebug` bag; attach via `patchLastLog` after `you` line
- Route `createGame.llm` through `callLLMProxy`; record `http[]`
- Parse/pushLore events; render `<details>`; copy respects toggle

## Task 3: CSS

- `.dbg` nested block; toggle label alignment with icon buttons

## Verify

- Toggle off: chat looks unchanged; copy = lines only
- Toggle on: nested debug under `you`; copy includes HTTP + events
- Reload: toggle state restored; prior turns keep `debug` bags
