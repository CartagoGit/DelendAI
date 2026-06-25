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
| Pick a model for a specific task right now | [`04-recommended-approach.md`](04-recommended-approach.md) |

---

## Contents

### 00 — Concepts
- [`00-glossary.md`](00-glossary.md) — handoff, BYOK, advisor, cascade, routing primitives
- [`01-the-problem.md`](01-the-problem.md) — distilled problem statement, three sub-problems
- [`02-our-infrastructure.md`](02-our-infrastructure.md) — what `mcp-vertex` already has today
- [`03-four-options-considered.md`](03-four-options-considered.md) — Options A / B / C / D, pros and cons
- [`04-recommended-approach.md`](04-recommended-approach.md) — Option D as concrete design

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
- [`patterns-to-borrow.md`](synthesis/patterns-to-borrow.md) — 8 patterns worth lifting into Option D

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
