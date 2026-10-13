# `external/` — One page per tool in the wild

The routing problem is not new. A dozen teams have shipped (or
deprecated) solutions. These pages summarise what each one does, with
URLs to the original docs.

Each page follows the same shape:

- **Summary** — what it is.
- **Routing model** — how it picks a model.
- **Catalog freshness** — how it knows about new models.
- **Subscription support** — does it bridge to Claude Code / Codex / Copilot subscriptions?
- **Pricing** — free, paid, BYOK.
- **URLs** — concrete links to docs and source.

The synthesis lives in [`synthesis/comparison-table.md`](../synthesis/comparison-table.md).
The patterns worth lifting into Option D live in
[`synthesis/patterns-to-borrow.md`](../synthesis/patterns-to-borrow.md).

---

## Contents

| Tool | Page | Class |
|---|---|---|
| LiteLLM | [litellm.md](litellm.md) | Proxy with BETA adaptive router |
| OpenRouter | [openrouter.md](openrouter.md) | Unified router with `openrouter/auto` (NotDiamond) |
| Aider | [aider.md](aider.md) | Terminal agent with declarative per-model cascade |
| Cursor | [cursor.md](cursor.md) | IDE with Auto / Composer / Premium model tiers |
| Continue.dev | [continue.md](continue.md) | IDE extension with per-role model config |
| GitHub Copilot | [github-copilot.md](github-copilot.md) | IDE with Auto mode and per-task model matrix |
| Claude Code | [claude-code.md](claude-code.md) | Terminal agent with `opusplan`, advisor, subagent models |
| Codex CLI | [codex-cli.md](codex-cli.md) | OpenAI's terminal agent, single-model per session |
| LangChain / LlamaIndex | [langchain-llamaindex.md](langchain-llamaindex.md) | Framework routers (mostly deprecated) |
| Portkey / Cloudflare | [portkey-cloudflare.md](portkey-cloudflare.md) | Gateway-level fallback, no smart routing |
| Leaderboards | [leaderboards.md](leaderboards.md) | Data sources (Artificial Analysis, arena.ai, Aider, HF) |
| MCP routing servers | [mcp-routing-servers.md](mcp-routing-servers.md) | Routing exposed as MCP tools |

---

## What the pages collectively show

Three patterns dominate the field:

1. **Declared configuration** (Aider, Continue, Claude Code) —
   user writes down what they have and what they want; the tool
   honours it.
2. **Vendor scorer** (Cursor Auto, GitHub Copilot Auto) —
   proprietary black-box algorithm picks the model.
3. **Learned auto-router** (LiteLLM Adaptive Router BETA,
   OpenRouter Auto via NotDiamond) — bandit / classifier picks
   per request, improves with feedback.

The deprecated approach is **LLM-as-router inside the framework**
(LangChain `LLMRouterChain`) — too slow, too costly, too unreliable.
We borrow its idea (LLM makes the routing decision) but place it
behind a tool call the user can audit, not in the hot path.

The richest declarative primitive in the field is Claude Code's
`opusplan` alias. We borrow it as the **mode-keyed routing** idea in
Option D.
