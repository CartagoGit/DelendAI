# Cursor

**Class:** IDE with Auto / Composer / Premium model tiers.

---

## Summary

IDE (fork of VS Code) with model picker and three routing layers.
**Currently the highest-volume "auto" user-facing system in
production.**

## Routing model

Three user-visible levels, **all gated by Cursor's internal scorer**:

1. **Auto** — Cursor picks models that "balance intelligence, cost
   efficiency, and reliability for everyday tasks." Pulls from the
   Auto + Composer pool, **not the API pool**. Composer 2.5
   (Cursor's own fine-tuned model) is the default under Auto.
2. **Composer** — Cursor's own models (Composer 1/1.5/2/2.5).
   Hidden by default; explicitly user-selectable. Trained for agentic
   coding.
3. **Premium** — "Cursor selects the most capable models for you,
   recommended for the most complex tasks. The Cursor team selects
   Premium models based on internal benchmarks, evaluations, and
   user feedback." Pulls from the **API pool** at the model's API
   rate.
4. **Specific model selection** — GPT-5.x, Claude 4.x, Gemini 3.x,
   Grok 4.x, etc. — pulls from the API pool at the model's API
   rate, with credit pricing disclosed per row.
5. **Max Mode** — extends context window to the maximum the model
   supports (e.g. 1M tokens on Sonnet 4.6 / Opus 4.7). Costs 2x on
   long context for some models.

## Catalog freshness

Per the docs, the model list and pricing is updated continuously;
model "hidden by default" flags suggest a curated review queue.

## Subscription-only support

❌ — Cursor is itself the subscription. Models are charged via
Cursor credits, not your Claude Code / Copilot / Codex subscription.

## Pricing

$20 Pro / $60 Pro+ / $200 Ultra. Premium model requests use the
**API pool** (separate credits); Auto + Composer use the **Auto +
Composer pool** (significantly more included usage, lower per-token
cost).

## URLs

- <https://cursor.com/docs/models>
- <https://cursor.com/blog/composer-2> (Composer 2 model blog)
- <https://cursor.com/blog/composer-2-5> (Composer 2.5 model blog)
- <https://cursor.com/docs/account/teams/pricing.md>
- <https://trust.cursor.com/subprocessors>

## What we can borrow for Option D

- **The three-tier label (Auto / Composer / Premium) maps cleanly to
  `costPreference: "minimize" | "balanced" | "maximize"`.** Users
  understand this vocabulary already.
- **Max Mode is exactly "route to the highest-context model that
  fits."** We could add `mode: "max-context"` that prefers the
  roster entry with the largest `contextWindow` over the cost tier.
- **The Auto + Composer vs API pool distinction** is a clean way to
  think about "I want this for free / included" vs "I'm OK paying
  per-token for this." We don't model this in the MVP but it's a
  future extension.
