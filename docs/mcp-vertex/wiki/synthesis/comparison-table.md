# Comparison table

Cross-tool synthesis of the 9 main routing systems surveyed in
[`external/`](../external/). All ratings as of 2026-06-25.

## The 9-tool comparison

| Tool | Routing source | Catalog freshness | Subscription support | Cost model | Best for |
|---|---|---|---|---|---|
| **LiteLLM** | Request-level load balancing + BETA adaptive bandit | Manual YAML + shared LiteLLM JSON (24h cache) | ❌ API-only | Free OSS; pay providers | API-key holders, 100+ providers |
| **OpenRouter** | Per-request classifier (NotDiamond) | Live `/api/v1/models` | ❌ API-only | Pay-per-token via OpenRouter credit | API-key holders, "just route it" |
| **Aider** | Per-model declared YAML cascade (3-tier) | LiteLLM JSON + OpenRouter scrape | ✅ **only one** with Copilot bridge | Free OSS | Version-controlled, auditable routing |
| **Cursor** | Vendor internal scorer | Curated review queue | ❌ vendor subscription | $20–$200/mo, model-tiered | "Don't make me think" users |
| **Continue** | Per-role static config | Manual adapter changes | ✅ any OpenAI-compatible endpoint | Free OSS; pay providers | Per-action granularity |
| **GitHub Copilot** | Vendor internal scorer + task matrix | Continuous by GitHub | ❌ + grants Claude Code/Codex agent access on Pro+ | $0–$100/mo | GitHub-centric teams |
| **Claude Code** | Aliases + `opusplan` + `advisorModel` + subagent frontmatter | Aliases update each release | ❌ Claude-only | $20–$200/mo or Bedrock/Vertex | Power users with deep Claude sub |
| **Codex CLI** | Single-model per session, user-selected | Bundled with CLI release | ✅ `Sign in with ChatGPT` | ChatGPT sub or OpenAI API key | OpenAI-only fans |
| **LangChain routers** | LLM reads prompt + picks (DEPRECATED) | N/A | ✅ whatever the LLM tool supports | OSS | Legacy only |
| **Portkey / Cloudflare / OpenLLMetry** | Declared fallback chains + observability | Manual config | ❌ API-only | Various | Governance, not smart routing |

## Three approach classes

The field collapses into three shapes:

### Class 1 — Declared configuration
- **Who:** Aider, Continue, Claude Code, our Option D.
- **Strengths:** Audit-able, deterministic, version-controlled.
- **Weaknesses:** Catalog maintenance is the user's problem.

### Class 2 — Vendor scorer
- **Who:** Cursor Auto/Premium, GitHub Copilot Auto.
- **Strengths:** Zero user effort.
- **Weaknesses:** Proprietary, opaque, vendor-locked.

### Class 3 — Learned auto-router
- **Who:** LiteLLM Adaptive Router (BETA), OpenRouter Auto (NotDiamond).
- **Strengths:** Improves with use.
- **Weaknesses:** API-only; opaque to the user; cold-start problem.

## Where the subscription gap lives

The single biggest functional gap in the field: **no production tool
routes to Claude Code / Codex subscriptions** as first-class
providers. Aider has the one working bridge (Copilot token
exchange). Everything else either:

- Is the subscription itself (Cursor, Copilot, Claude Code, Codex).
- Requires API keys (LiteLLM, OpenRouter, Portkey, Cloudflare).

**Our Option D's `kind: "subscription"` providers with `invoke:
"claude --model opus-4-8"` are the right answer for this gap** —
honest about the limit (we make the command, the user runs it), but
fully integrated into the routing decision.

## Where the freshness gap lives

The single biggest *operational* gap: catalogs change weekly. The
field's only real solutions are:

- **Live upstream feeds** (OpenRouter API, LiteLLM JSON) — best
  when you trust the upstream.
- **User-declared rosters** (Aider, Continue, Claude Code) — best
  when you want full control.
- **Vendor curation** (Cursor, Copilot) — best when you don't want
  to think about it.

There is **no production system that automatically detects new
models on a provider you have a key for**. Even OpenRouter, which
does this best, still requires you to opt in to a new model after
it appears.

## Where the cost-routing gap lives

Real-time per-token routing (decide mid-session whether to switch
models because cost is exploding) requires a **token usage stream**.
Only LiteLLM and Portkey have it, and only because they proxy the
requests.

**An orchestrator that does NOT proxy requests (like `mcp-vertex`)
cannot have a real-time token stream without `onTokenUsage` from
the host.** This is a known limitation; v2 of Option D can address it
by adding the hook.

## What's the wiki's recommendation?

Read [`../03-four-options-considered.md`](../03-four-options-considered.md)
and [`../04-recommended-approach.md`](../04-recommended-approach.md).
Short version: **Option D** — declared roster + LLM-as-advisor +
mode-keyed routing, with subscription-via-CLI-handoff as the honest
answer for Claude Code and Codex.
