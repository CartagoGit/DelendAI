# LiteLLM

**Class:** Proxy with BETA learned router.

---

## Summary

Unified proxy/API in front of 100+ LLM providers (`BerriAI/litellm`).
The `Router` class does load balancing, fallback, cooldowns. As of
2026 it ships a **BETA Adaptive Router** that *learns per-request-type
which model is best*, using a contextual bandit.

## Routing model

Three layers, all **request-level**, none per-task:

1. **`Router.acompletion(model="gpt-4", …)`** — picks a deployment
   behind that alias using `routing_strategy`: `simple-shuffle`,
   `latency-based-routing`, `cost-based-routing`,
   `usage-based-routing-v2`, `rate-limit-aware`.
2. **`routing_groups`** binds specific `model_name`s to a per-group
   strategy (e.g. `gpt-4o` → latency-based, `cheap-model` →
   simple-shuffle). Group resolved *after pre-routing-hook per
   request*.
3. **BETA Adaptive Router** (`auto_router/adaptive_router`) — a
   separate router name. Classifies each request into 7 types
   (`code_generation`, `code_understanding`, `technical_design`,
   `analytical_reasoning`, `writing`, `factual_lookup`, `general`)
   and tracks per-cell quality estimates in **Postgres**. Cold-start
   uses declared `quality_tier` (1=budget, 2=mid, 3=frontier) and
   `strengths`; warm uses bandit mean. Tunable
   `weights: {quality: 0.7, cost: 0.3}` per router. Header
   `x-litellm-min-quality-tier: 3` forces a tier.

## Catalog freshness

Hardcodes pricing/context in
`model_prices_and_context_window.json` in the repo — **manual PRs**.
Aider, Continuum, and others pull this file as the de-facto standard.
Adaptive Router cell updates are runtime learning, but the *pool* of
available models is whatever's in `model_list` — you declare it.

## Subscription-only support

✅ Anthropic API + Bedrock + Vertex + OpenAI + Azure + Groq + Together
+ … 100+ providers. **GitHub Copilot / Claude Code *subscriptions*
are NOT supported** — there's no IDE-bridge for them. (Aider has one
for Copilot; see [aider.md](aider.md).)

## Pricing

Free OSS. Paid managed proxy. Token cost = underlying provider's cost
(no markup).

## URLs

- <https://docs.litellm.ai/docs/routing> — routing strategies
- <https://docs.litellm.ai/docs/adaptive_router> — BETA Adaptive Router
- <https://docs.litellm.ai/docs/proxy/load_balancing>
- <https://docs.litellm.ai/docs/proxy/auto_routing>
- <https://github.com/BerriAI/litellm>
- <https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json>

## What we can borrow for Option D

- The 7-type task classifier (`code_generation`, `code_understanding`,
  `technical_design`, `analytical_reasoning`, `writing`,
  `factual_lookup`, `general`) is a more disciplined starting point
  than free-form "give the LLM the task description". Consider
  adopting it (or a subset) as `CapabilityTag` values.
- The `quality_tier: 1|2|3` cold-start prior is a clean pattern for
  bootstrapping the scoring function before any observed data.
- `weights: {quality: 0.7, cost: 0.3}` per router → our
  `costPreference: "minimize" | "balanced" | "maximize"`.
