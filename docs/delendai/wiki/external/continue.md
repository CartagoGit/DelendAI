# Continue.dev

**Class:** IDE extension with per-role model config.

---

## Summary

Open-source AI code assistant for VS Code / JetBrains
(`continuedev/continue`). Model selection is **per-role**, not
per-task: `models` array with
`roles: ["chat", "edit", "apply", "autocomplete"]`. Each role can
be assigned to a different provider/model.

## Routing model

Per-role static config. The user writes `config.json` (or
`config.yaml`) mapping roles to providers; Continue uses different
roles for different interactions (chat uses the chat model, inline
completion uses the autocomplete model). **There is no built-in
auto-router.**

However, Continue supports:

- **Custom model providers** — write a Python or JS class that
  implements a `CustomLLM` interface; the entire routing decision is
  yours.
- **Fallback chains** — `models: [...]` with `title` ordering is a
  static list.

## Catalog freshness

New models require a code change (either add to the provider adapter,
or use the OpenAI-compatible adapter). **Manual.**

## Subscription-only support

✅ — supports any OpenAI-compatible endpoint, including GitHub
Copilot (`provider: "openai"` with Copilot's API base), Claude Code
via Anthropic SDK, Codex via OpenAI SDK with Codex's base URL.

## Pricing

Free OSS; you pay providers directly.

## URLs

- <https://docs.continue.dev/models>
- <https://docs.continue.dev/model-providers>
- <https://docs.continue.dev/customize/model-roles>
- <https://github.com/continuedev/continue>

## What we can borrow for Option D

- **Per-role config is a clean pattern even when the "roles" are
  our `mode` enum.** Continue's `roles: [chat, edit, apply,
  autocomplete]` is structurally the same as our
  `mode: [plan, explore, implement, review]`. The vocabulary is
  different but the shape is identical.
- **Custom LLM providers** — Continue's escape hatch for "I want my
  own routing logic" is exactly the right escape hatch. Our
  `<prefix>_advise_routing` tool plays the same role at the MCP
  layer.
- **Fallback chains** — we don't model this in the MVP but
  `<prefix>_advise_routing` already returns `alternates: IRoutingDecision[]`
  (top 2 backups). Promoting that to a "tried-and-failed" fallback
  chain is a one-line extension.
