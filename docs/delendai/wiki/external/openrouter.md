# OpenRouter

**Class:** Unified router with `openrouter/auto` (powered by NotDiamond).

---

## Summary

Unified router over 200+ models from 50+ providers. Provides both
**explicit** ("send to this exact provider/model") and **automatic**
(`model: "openrouter/auto"`) routing. The Auto Router is **powered by
NotDiamond** (a separate company) — OpenRouter is a thin wrapper.

## Routing model

Per-request classification by NotDiamond. Tunables:

- `cost_quality_tradeoff: 0–10` (default **7**; 0 = pure quality,
  10 = pure cost).
- `allowed_models: ["anthropic/*", "openai/gpt-5.1"]` via
  `plugins: [{id: "auto-router", allowed_models: [...]}]`.
- **`session_id`** pins both model *and* provider for the duration of
  a multi-turn conversation (cache expires after 5 min idle; implicit
  stickiness auto-engages after first cache-hit).
- Returns the actual model used in `response.model`.

**Also provides:**

- `~openai/gpt-latest`, `~anthropic/claude-sonnet-latest` —
  *latest-version alias* routing for each family. **This is the
  pattern that solves the catalog-freshness problem** — the user
  never names a specific model version, the router picks the
  freshest qualified one.
- `Model Fallbacks` chain config.
- `Provider Selection` (route to cheapest/fastest provider hosting a
  model).
- **BYOK**: pass `OpenRouter API key` + your provider credentials →
  OpenRouter acts as identity/observability layer, but providers
  charge you.

## Catalog freshness

OpenRouter's `/api/v1/models` is queried live; the public site shows
new models within days of release. Pricing pulled from provider docs
and refreshed regularly. **No manual PR needed.**

## Subscription-only support

❌ No Claude Code, no Codex, no Copilot subscription support.
API-only. (Aider has Copilot via token exchange; see
[aider.md](aider.md).)

## Pricing

Pay-per-token via OpenRouter credit; no markup for the Auto Router
("no additional fee for using the Auto Router"). BYOK has no
OpenRouter fee for the token.

## URLs

- <https://openrouter.ai/docs/guides/routing/routers/auto-router>
- <https://openrouter.ai/docs/quickstart>
- <https://openrouter.ai/docs/guides/routing/routers/latest-resolution>
- <https://openrouter.ai/docs/guides/routing/model-fallbacks>
- <https://openrouter.ai/models> (live catalog)
- <https://openrouter.ai/docs/_mcp/server> — **notable**: they expose
  the routing config as an MCP server itself

## What we can borrow for Option D

- **`session_id` stickiness** — pin the chosen model across a
  session's turns; otherwise prompt cache misses and inconsistent
  behaviour. 5-minute idle expiry is a sensible default.
- **`cost_quality_tradeoff: 0–10`** as our `costPreference` (we map
  it to three buckets: minimize / balanced / maximize).
- **`~family/latest` aliases** — the **single best pattern for
  catalog freshness** in the field. Our roster entries could
  optionally use `modelId: "anthropic/claude-sonnet-latest"` and let
  OpenRouter resolve at call time. Not all providers support this,
  but for OpenRouter-backed entries it's free.
- **Expose the routing decision as MCP** — they ship
  `<https://openrouter.ai/docs/_mcp/server>` as an MCP server. Same
  shape we want for `advise_routing`.
