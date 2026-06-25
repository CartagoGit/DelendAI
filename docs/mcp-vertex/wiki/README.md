# `mcp-vertex` wiki

Living knowledge base for `@mcp-vertex/core` — everything we have learned,
gathered, decided, or decided-against that does not belong in a proposal,
a skill, or the code itself.

> **Status:** Wiki, not gospel. Pages are dated and may be challenged by
> newer proposals. When in doubt, the latest proposal in
> `docs/mcp-vertex/proposals/done/` wins.

---

## How to use this wiki

| If you want to… | Start at |
|---|---|
| Onboard to the project quickly | [`01-the-problem.md`](01-the-problem.md) → [`02-our-infrastructure.md`](02-our-infrastructure.md) |
| Understand a specific term (handoff, BYOK, cascade, advisor) | [`00-glossary.md`](00-glossary.md) |
| Compare what the outside world does | [`external/`](external/) — one page per tool |
| Decide "should we build X?" | [`synthesis/comparison-table.md`](synthesis/comparison-table.md) → [`synthesis/patterns-to-borrow.md`](synthesis/patterns-to-borrow.md) |
| See concrete usage examples | [`scenarios/`](scenarios/) — the user's "Copilot + M3 MiniMax" example and others |
| Pick a model for a specific task right now | [`04-recommended-approach.md`](04-recommended-approach.md) — Option D (handoff), v2 with root-level `providers` |
| [`05-option-E-subprocess-mcp.md`](05-option-E-subprocess-mcp.md) — Option E (subprocess + MCP client) |
| [`06-bootstrap-and-quotas.md`](06-bootstrap-and-quotas.md) — bootstrap wizard, quotas, fallback |
| [`07-plugin-orchestrator-runner.md`](07-plugin-orchestrator-runner.md) — the plugin |
| [`08-usage-tracking-plugin.md`](08-usage-tracking-plugin.md) — observability plugin |

---

## Contents

### 00 — Concepts
- [`00-glossary.md`](00-glossary.md) — handoff, BYOK, advisor, cascade, routing primitives
- [`01-the-problem.md`](01-the-problem.md) — distilled problem statement, three sub-problems
- [`02-our-infrastructure.md`](02-our-infrastructure.md) — what `mcp-vertex` already has today
- [`03-four-options-considered.md`](03-four-options-considered.md) — Options A / B / C / D, pros and cons
- [`04-recommended-approach.md`](04-recommended-approach.md) — Option D as concrete design

### 05–08 — Runtime concerns (built on top of 00–04)
- [`05-option-E-subprocess-mcp.md`](05-option-E-subprocess-mcp.md) — spawn `claude -p` / `codex exec` / `codex mcp-server` as subprocesses; chain tools without the user pasting anything. **Supersedes Option D's execution model.**
- [`06-bootstrap-and-quotas.md`](06-bootstrap-and-quotas.md) — wizard, cache/config split, healthcheck, quota tracking (3 sources + reset), fallback chains with TTL, LLM-as-cost-analyst.
- [`07-plugin-orchestrator-runner.md`](07-plugin-orchestrator-runner.md) — the new plugin; tools, contracts, subprocess pool, MCP-client for Codex.
- [`08-usage-tracking-plugin.md`](08-usage-tracking-plugin.md) — the dedicated observability plugin (per-agent / per-plugin / per-model / per-extension).

### `external/` — One page per tool in the wild
- [`litellm.md`](external/litellm.md)
- [`openrouter.md`](external/openrouter.md)
- [`aider.md`](external/aider.md)
- [`cursor.md`](external/cursor.md)
- [`continue.md`](external/continue.md)
- [`github-copilot.md`](external/github-copilot.md)
- [`claude-code.md`](external/claude-code.md)
- [`codex-cli.md`](external/codex-cli.md)
- [`langchain-llamaindex.md`](external/langchain-llamaindex.md)
- [`portkey-cloudflare.md`](external/portkey-cloudflare.md)
- [`leaderboards.md`](external/leaderboards.md)
- [`mcp-routing-servers.md`](external/mcp-routing-servers.md)

### `synthesis/` — Cross-tool analysis
- [`comparison-table.md`](synthesis/comparison-table.md) — 9 columns × 9 tools
- [`copilot-with-minimax-byok.md`](scenarios/copilot-with-minimax-byok.md) — the user's exact example, end-to-end (Option D)
- *Coming:* `copilot-with-minimax-byok-option-E.md` — same scenario under Option E (orchestrator drives everything)ifting into Option D

### `scenarios/` — Concrete walks-throughs
- `scenarios/copilot-with-minimax-byok.md` — the user's exact example, end-to-end

---

## Provenance

Pages in `external/` and `synthesis/` were produced on **2026-06-25** from a
focused research pass. Sources are cited inline (URLs in the source markdown
of each page). The user-facing decision ("we'll likely build Option D")
remains a recommendation, not a ratified proposal. See
[`04-recommended-approach.md`](04-recommended-approach.md) for the
ratification checklist.
