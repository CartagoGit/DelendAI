# Portkey / Cloudflare AI Gateway / OpenLLMetry

**Class:** Gateway-level fallback, observability, no smart routing.

---

## Summary

Three production gateways that touch the routing problem from the
*observability / governance* side rather than the *intelligence*
side. None of them do smart routing — they give you the plumbing
to declare fallback chains and per-model policies.

## Portkey

Virtual Keys → **Model Catalog** (2026 redesign). One Portkey API
key → many providers via `@provider-slug/model-name` format.
**Per-model fine-grained governance** (budgets, rate limits,
allow-lists). **No auto-routing**; the model is explicit.

- Docs: <https://portkey.ai/docs/product/model-catalog>
- Docs: <https://portkey.ai/docs/product/ai-gateway/virtual-keys>
- Source: <https://github.com/portkey-ai/gateway>
- MCP: ships `@portkey-ai/mcp-server` exposing catalog + governance
  as MCP tools

## Cloudflare AI Gateway

A unified endpoint for OpenAI / Anthropic / Google / Replicate /
Workers AI. Features: analytics, caching, **rate limiting, "request
retry and model fallbacks"**. Fallbacks are user-declared chains;
no auto-routing. Cloud-only.

- Docs: <https://developers.cloudflare.com/ai-gateway/>
- Docs: <https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/>

## OpenLLMetry

Pure observability layer (OpenTelemetry for LLMs). **No routing.**

- Source: <https://github.com/traceloop/openllmetry>

## What we can borrow for Option D

- **Portkey's `@provider-slug/model-name` ID format** is the same
  shape as OpenRouter's. Adopt it in our `modelId` field so an
  OpenRouter-backed entry uses
  `modelId: "anthropic/claude-sonnet-4-6"` without surprises.
- **Per-model governance** (budgets, rate limits, allow-lists) is
  a future extension for Option D: once we have a real `onTokenUsage`
  hook, we can enforce a per-provider budget per session.
- **Portkey's MCP server** is precedent for shipping the model
  catalog itself as an MCP tool. We could expose our roster as
  `<prefix>_provider_catalog` for agents that want to inspect it.
- **Cloudflare's "request retry and model fallbacks"** — the
  alternates list in `<prefix>_advise_routing` is a v2 step toward
  this; on first failure, the next alternate is tried
  automatically.
