# LLM Router Admin Config — Design

Date: 2026-07-18

## Problem

York hardcodes OpenRouter (`https://openrouter.ai/api/v1/chat/completions` + `OPENROUTER_API_KEY`) and splits the model across `YORK_LLM_MODEL` / `LORE_VALIDATOR_MODEL`. Switching to TokenRouter (or any OpenAI-compatible router) requires redeploying env vars. Admin should be able to point the backend at a different chat-completions URL, pick which Vercel `*_API_KEY` to use, and set one model string — without putting secrets in the browser.

## Goals

- Admin page section to edit: **endpoint URL**, **API key env name**, **model**
- API key **values** stay in Vercel env; UI only selects the env **name**
- Auto-discover `*_API_KEY` names present in the process env
- Authoritative config in **Redis** (same store as shared lore)
- Browser `localStorage` remembers last selected key name for the dropdown only
- Unify player + lore-validator model into one `model` field
- Playtest harness honors the same Redis config when available, else `.env` defaults
- No auth beyond existing open admin (same as lore curation)

## Non-goals

- Storing API key values in Redis or the client
- Separate models for validator vs player
- Provider-specific SDKs (OpenAI-compatible HTTP only)
- Auth / admin token gate

## Config shape

Redis key: `york:llm-config`

```json
{
  "endpointUrl": "https://openrouter.ai/api/v1/chat/completions",
  "apiKeyEnv": "OPENROUTER_API_KEY",
  "model": "nvidia/nemotron-3-ultra-550b-a55b:free"
}
```

- `endpointUrl` — full chat-completions URL (no path joining)
- `apiKeyEnv` — name of an env var matching `*_API_KEY` that exists and is non-empty
- `model` — single model id for `/api/llm` and lore semantic validation

Local file fallback (dev, no Redis): `.cache/llm-config.json` (same durability rules as shared lore: refuse durable writes on Vercel without Redis).

## Resolution order

For each call (`/api/llm`, lore `semanticConflict`, harness direct LLM):

1. Load stored config (Redis, else local file, else empty)
2. Resolve:
   - `endpointUrl` ← stored or default OpenRouter chat URL
   - `apiKeyEnv` ← stored or `OPENROUTER_API_KEY`
   - `model` ← stored or `YORK_LLM_MODEL` or `LORE_VALIDATOR_MODEL` or default free slug
   - `apiKey` ← `process.env[apiKeyEnv]` (never from storage)
3. If no key → same failure modes as today (`no_key` / offline heuristic)

Legacy env model vars remain **cold-start fallbacks only** once Redis is set; admin is the primary switch.

## API

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/api/llm-config` | `{ config, apiKeyEnvs, store }` — names only, never key values |
| PUT | `/api/llm-config` | Body `{ endpointUrl, apiKeyEnv, model }`; validate; persist; return same shape |

Validation:

- `endpointUrl` must be `http:` or `https:` URL
- `apiKeyEnv` must match `/^[A-Z0-9_]+_API_KEY$/` and exist with a non-empty value in env
- `model` non-empty string (max 200 chars)

`apiKeyEnvs`: sorted list of env keys matching `*_API_KEY` with truthy values.

## Admin UI

New **LLM Router** section on `admin.html` (above or beside lore tooling):

- Text: Endpoint URL
- Select: API key env (options from GET `apiKeyEnvs`)
- Text: Model
- Save → PUT `/api/llm-config`
- On load: fill from Redis `config`; if select has no Redis value, preselect `localStorage['york:llm-apiKeyEnv']` when still in the list
- On successful save: write that key name to `localStorage`

Open — no admin token.

## Shared module

`scripts/lib/llm-config.mjs`:

- defaults, discover, validate, resolve (pure / sync)
- read/write helpers that take a Redis client or use local file

`api/lore.js` and `harness/` both use this module. Rename internal `callOpenRouter` to a generic chat-completions caller that uses resolved endpoint + key + model.

## Harness

After `loadConfig()`:

1. Try read Redis/`llm-config` via shared helper
2. Overlay `LLM_ENDPOINT_URL`, selected key value onto the client’s auth header field, and `PLAYER_MODEL` from resolved `model`
3. If no store: keep today’s `.env` / defaults (OpenRouter URL + `OPENROUTER_API_KEY`)

When `API_BASE` is set, harness still uses the proxy (proxy itself reads Redis). Direct mode uses resolved endpoint/key/model.

## Error handling

- Missing key after resolve → existing `no_key` / 503
- Upstream 429 / non-OK → existing status mapping
- Invalid PUT body → 400 with reason
- Vercel write without Redis → 503 `no_durable_store` (same as lore)

## Testing

- Unit: discover / validate / resolve (including fallbacks)
- Integration: GET/PUT `/api/llm-config` via handler mock; LLM call uses stored endpoint (fetch mock or env)
- Harness config test: overlay from stored object

## Docs

Update README env table: note Redis admin config; `YORK_LLM_MODEL` / `LORE_VALIDATOR_MODEL` as fallbacks only.
