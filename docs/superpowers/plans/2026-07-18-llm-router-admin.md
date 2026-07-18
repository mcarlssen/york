# LLM Router Admin Config — Implementation Plan

> **For agentic workers:** Inline execution in this session (user requested implement → branch → push → merge).

**Goal:** Admin-editable Redis LLM router config (endpoint URL, `*_API_KEY` env name, unified model) used by `/api/llm`, lore validation, and harness.

**Architecture:** Shared `scripts/lib/llm-config.mjs`; Redis key `york:llm-config`; GET/PUT `/api/llm-config`; admin section; harness overlays resolved config.

**Tech Stack:** Node ESM, Upstash Redis, existing `api/lore.js` handler, vanilla `admin.html`.

## Global Constraints

- Never expose API key values to the client
- Full chat-completions URL (no base-path joining)
- Open admin (no token)
- Local file fallback `.cache/llm-config.json` when not on Vercel

---

### Task 1: `scripts/lib/llm-config.mjs` + unit tests

**Files:**
- Create: `scripts/lib/llm-config.mjs`
- Create: `scripts/test-llm-config.mjs`
- Modify: `package.json` (add `test:llm-config`, fold into `test`)

- [x] Implement defaults, `listApiKeyEnvNames`, `validateLlmConfig`, `resolveLlmConfig`, read/write with redis-or-file
- [x] Tests for discover / validate / resolve fallbacks

### Task 2: Wire `api/lore.js`

- [x] Use resolved config in semantic + LLM proxy
- [x] GET/PUT `/api/llm-config`
- [x] Extend `scripts/test-shared-lore.mjs` or dedicated handler tests

### Task 3: Admin UI + harness + docs

- [x] LLM Router section on `admin.html`
- [x] Harness `config.mjs` / `llm.mjs` overlay
- [x] README note
- [x] Branch, push, PR, merge
