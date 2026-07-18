# Improvise Intent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `improvise` action — LLM pass/fail validation with materials brief; offline routing floor.

**Architecture:** Interpreter emits `improvise`; `genImprovise` returns ok/result/consume/playerFacts; engine commits on pass only. Spec: `docs/superpowers/specs/2026-07-18-improvise-intent-design.md`.

**Tech Stack:** `index.html` engine, `scripts/lib/world-memory.mjs` helpers + tests.

---

### Task 1: Intent helpers + tests

**Files:**
- Modify: `scripts/lib/world-memory.mjs`
- Modify: `scripts/test-world-memory.mjs`

**Steps:**
1. Add `isImproviseIntent(text)`, `isSiteBuild(text)`, `salvageImproviseJSON(raw)`.
2. Tests: make club / use cloth to tie → improvise; build raft → site build; pass/fail JSON salvage.
3. Run `node scripts/test-world-memory.mjs`.

### Task 2: Wire engine

**Files:**
- Modify: `index.html`

**Steps:**
1. Import new helpers.
2. `offlineParse` + `callLLM` schema/priority → improvise.
3. `applyAction` case + `doImprovise` + `genImprovise`.
4. Avoid splitting craft `then` compounds into ask+use.

### Task 3: Ship

**Steps:**
1. Commit on `feat/improvise-intent`, push, open PR, merge to main.
