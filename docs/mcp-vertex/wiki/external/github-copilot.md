# GitHub Copilot

**Class:** IDE with Auto mode and per-task model matrix.

---

## Summary

Microsoft's AI extension. As of 2026 it routes between many first-
and third-party models (Claude Fable 5, Claude Opus 4.7/4.8, Claude
Sonnet 4.5/4.6, GPT-5.x, Gemini 3.x, MAI-Code-1-Flash, Raptor mini,
Qwen2.5). **Has a real "Auto" mode** for Chat.

## Routing model

Per-chat request:

- **Auto mode** — "Auto will automatically select the best model for
  you based on availability" (docs). The actual selection algorithm
  is GitHub's internal scorer and is not publicly documented; you
  can manually override.
- **Manual selection** — user picks from a curated matrix of
  "Recommended models by task":
  - *General-purpose coding & writing*: GPT-5.3-Codex, GPT-5 mini,
    Raptor mini, MAI-Code-1-Flash
  - *Fast help / simple tasks*: Claude Haiku 4.5, MAI-Code-1-Flash
  - *Deep reasoning & debugging*: GPT-5 mini, GPT-5.5, Claude Sonnet
    4.6, Claude Opus 4.7, Gemini 3.1 Pro
  - *Working with visuals*: GPT-5 mini, Claude Sonnet 4.6,
    Gemini 3.1 Pro
- **Inline completions** — separate model picker with its own default
  (typically a small/fast model). Different rate limit ("2,000
  completions/month" on Free vs. unlimited on Pro).
- **Multi-agent assignment** — when assigning GitHub Issues to
  agents, you can pick "Copilot, Claude by Anthropic, or OpenAI
  Codex" — three independent agents, each with its own model.

## Catalog freshness

Updated continuously by GitHub (model cards linked to vendor system
cards). No public PR-based process.

## Subscription-only support

❌ — Copilot IS the subscription. Models route via Copilot's billing.

## Pricing

Free / $10 Pro / $39 Pro+ / $100 Max per month. **Includes "3rd party
agents (Claude Code and Codex)" on Pro and up** — i.e. Copilot Pro
grants you access to run Claude Code and Codex *as agents inside the
Copilot UI*, distinct from a Claude Code or ChatGPT subscription.

## URLs

- <https://docs.github.com/en/copilot/using-github-copilot/ai-models/choosing-the-right-ai-model-for-your-task>
- <https://docs.github.com/en/copilot/concepts/auto-model-selection>
- <https://docs.github.com/en/copilot/using-github-copilot/ai-models/supported-ai-models-in-copilot>
- <https://github.com/features/copilot>

## What we can borrow for Option D

- **The curated "recommended by task" matrix** is a great starting
  point for the default `strengths`/`weaknesses` of common models.
  Worth transcribing (with attribution) as starter values when the
  user adds a new model to their roster.
- **Multi-agent assignment** (Copilot / Claude / Codex as separate
  agents, each with their own model) is structurally identical to
  Option D's `<prefix>_format_handoff` returning a CLI command for
  another tool. The shape matches: pick the agent, give it the
  prompt, run it.
- **The split between Chat model picker and Inline completions
  model** maps to our `mode: "implement"` vs `mode: "explore"`.
  Inline completions are fast/cheap; chat is more capable. Same
  cost-tier trade-off.
