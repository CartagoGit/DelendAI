# Aider

**Class:** Terminal agent with declarative per-model cascade.

---

## Summary

Terminal-based pair programmer (`Aider-AI/aider`). **The richest
"declarative per-model routing" config in the wild** — every model
entry has companion `weak_model_name` (cheap model for commit
messages / summaries) and `editor_model_name` (cheaper model for
the edit-formatting step). Effectively a **3-tier cascade** for every
supported model, committed to git.

## Routing model

**Static, declared, per main-model.** Two sub-routes:

- `weak_model_name: anthropic.claude-3-5-haiku-20241022-v1:0` —
  used for summarization, commit messages, low-stakes follow-ups.
- `editor_model_name: anthropic.claude-sonnet-4-20250514-v1:0` —
  used for the "editor diff" format (cheap model applies the edit
  grammar).
- `editor_edit_format: editor-diff` — separate prompt format
  optimized for editors.
- **PLUS** aliases: `sonnet` → `claude-sonnet-4-6`, `opus` →
  `claude-opus-4-7`, `4o`, `flash`, `deepseek` …
- **PLUS** runtime override: `--weak-model <name>`,
  `--editor-model <name>`, `--model <name>`.
- **PLUS** user overrides via `.aider.model.settings.yml` and
  per-model metadata in `.aider.model.metadata.json`.

## Catalog freshness

Bundled YAML ships with aider. `ModelInfoManager` fetches
`model_prices_and_context_window.json` from LiteLLM's repo on demand
with a **24-hour cache TTL** (the canonical catalog is shared with
LiteLLM). It also scrapes OpenRouter pages for `openrouter/*` model
pricing. **Auto-detects** new OpenRouter models via this scrape path.

## Subscription-only support

✅ **YES — unique among all the tools here.**

- `models.py:github_copilot_token_to_open_ai_key` exchanges
  `GITHUB_COPILOT_TOKEN` for an OpenAI-compatible bearer via
  `https://api.github.com/copilot_internal/v2/token`, then talks to
  Copilot's API as if it were OpenAI.
- Codex subscription: not directly, but the same pattern is possible
  since Codex exposes an OpenAI-compatible API at `chatgpt.com/codex`.
- Claude Code subscription: not directly — Anthropic's OAuth tokens
  for Claude.ai are not interchangeable with Claude Code session
  auth, but `claude setup-token` produces a long-lived OAuth token
  that *could* in principle be used.

## Pricing

Free OSS.

## URLs

- <https://aider.chat/docs/llms.html> (supported providers)
- <https://aider.chat/docs/config/adv-model-settings.html> (full
  YAML spec — `weak_model_name`, `editor_model_name`,
  `editor_edit_format`)
- <https://aider.chat/docs/llms/github.html> (GitHub Copilot
  subscription integration)
- <https://github.com/Aider-AI/aider/blob/main/aider/models.py>
  (`github_copilot_token_to_open_ai_key`, `OpenRouterModelManager`)
- <https://github.com/Aider-AI/aider/blob/main/aider/openrouter.py>

## What we can borrow for Option D

- **The two-tier cascade as default declared config.** Every entry
  in the roster could get a `weak` (cheap summarizer / commit-message
  model) and optionally `editor` (cheap format-strict model). This
  is the simplest, most auditable schema; Aider proves it scales to
  500+ model entries.
- **LiteLLM JSON as upstream feed.** Aider's `ModelInfoManager`
  already pulls `model_prices_and_context_window.json` with 24h
  cache. Reuse that path (or mirror its structure) to keep our
  `contextWindow` and `costTier` fresh for any model that's in the
  shared catalog.
- **GitHub Copilot token-exchange shim** — the one production
  precedent for bridging a subscription to a third-party tool. We
  could implement it in v2 of Option D to enable the
  `kind: "subscription"` providers to be invoked directly from the
  MCP server when the user opts in.
