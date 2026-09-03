# Codex CLI

**Class:** OpenAI's terminal agent, single-model per session.

---

## Summary

OpenAI's terminal coding agent (`openai/codex`, Rust 96.5%, 93.7k
stars). Authenticates via **ChatGPT subscription** (`Sign in with
ChatGPT`) or OpenAI API key. Multi-platform CLI; also runs as VS
Code / Cursor / Windsurf extension.

## Routing model

**Single-model per session**, user-selected. The README documents
`--model` and a config-driven `model:` setting. **No
`opusplan`-equivalent. No fallback chains documented. No
auto-routing.**

## Catalog freshness

Updated with each CLI release; the catalog mirrors OpenAI's flagship
models (GPT-5.x / GPT-5.x-Codex / o-series) and is **OpenAI-only** —
no Anthropic / Gemini / DeepSeek routing.

## Subscription-only support

✅ — `Sign in with ChatGPT` is the recommended auth path; works with
Plus / Pro / Business / Edu / Enterprise ChatGPT plans. API-key auth
is the alternative.

## Pricing

Bundled with ChatGPT subscription; API-key auth uses standard OpenAI
rates.

## URLs

- <https://github.com/openai/codex>
- <https://developers.openai.com/codex>
- <https://developers.openai.com/codex/auth>
- <https://help.openai.com/en/articles/11369540-codex-in-chatgpt>

## What we can borrow for Option D

- **`codex --model <name> "<prompt>"`** is the exact CLI shape we
  want to generate in `<prefix>_format_handoff` for `kind: "cli"`
  providers. Codex is one of the canonical targets.
- **The `model:` config setting** mirrors the per-session stickiness
  pattern. Once you've picked Codex for a session, it stays Codex
  until you change it.
- **Auth paths** are worth documenting in the wiki because users
  will ask: "how do I tell my orchestrator I have a Codex
  subscription?" — the answer is
  `invoke: "codex --model gpt-5.5 '...'"`
  with no env var.
