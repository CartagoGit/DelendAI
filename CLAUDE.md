# CLAUDE.md — working in `@mcp-vertex/core`

Canonical rules live in
[`docs/mcp-vertex/AGENT-BOOTSTRAP.md`](docs/mcp-vertex/AGENT-BOOTSTRAP.md) —
that file is the single source of truth for repo-wide agent rules, always loaded
by every host. `AGENTS.md` adds the repo-/host-specific rules the bootstrap
cannot enforce (root layout, commands, hard rules, conventions). Read both.
This file adds session-level guidance for whichever agent is driving the main
thread.

## Discovery

For tool / skill / proposal routing, follow `mcp-vertex_overview { compact: true }`
with `mcp-vertex_agent_catalog`. The canonical discovery surface is regenerated
by `bun run catalog:generate` and the single host-instructions fragment lives at
[`docs/mcp-vertex/host-hints/agent-instructions.generated.md`](docs/mcp-vertex/host-hints/agent-instructions.generated.md).
Treat that fragment as the source of truth for actionable proposals and skill
routing — do not duplicate the catalog facts in this file.

- **Host footnote:** Bootstrap appendix 8.2 (keep the main thread cheap) is in effect.

## Keep the main thread cheap

This repo's MCP host (`scripts/host-server.ts`) runs `--preset=swarm`, which
loads the active plugin preset (currently 9 of the 16 shipped plugins — see
[`AGENTS.md`](AGENTS.md) for the live list). Tool *results* stay
in context for the rest of the session, so how you call these tools matters:

- **Delegate non-trivial work.** For any real change to `packages/core`, a
  plugin, the build/release scripts, or `apps/web`, use the
  `mcp-vertex-orchestrator` subagent instead of driving `proposals_*` tools
  directly from the main thread. As an operational threshold, treat a task as
  non-trivial once it needs more than 3 tool calls, touches multiple files, or
  needs repeated MCP reads to complete. It knows the working loop, the
  invariants, and the multi-agent coordination primitives.
- **Prefer compact tools when orienting directly.** Use
  `mcp-vertex_overview` with `compact: true`, `proposals_auto_work`, and
  `proposals_compact_status` over verbose equivalents (`proposal_board`,
  full `state_health` dumps) unless you specifically need the verbose detail.
- **Prefer distilled recall over re-reading.** If a fact should survive beyond
  the current slice, recall it from durable memory; if it is only useful right
  now, keep it transient and compact it away when the task changes.
- **`/compact` between unrelated tasks.** Once a slice/proposal is closed and
  before starting unrelated work, compact — don't carry its tool output
  forward for the rest of the session.
