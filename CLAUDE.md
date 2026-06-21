# CLAUDE.md — working in `@mcp-vertex/core`

Canonical rules live in [`AGENTS.md`](AGENTS.md) — read that first for the
repo's invariants, commands, and conventions. This file adds session-level
guidance for whichever agent is driving the main thread.

## Keep the main thread cheap

This repo's MCP host (`scripts/host-server.ts`) runs `--preset=swarm`, which
loads ~9 plugins and a large `proposals_*` tool surface. Tool *results* stay
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
- **`/compact` between unrelated tasks.** Once a slice/proposal is closed and
  before starting unrelated work, compact — don't carry its tool output
  forward for the rest of the session.
