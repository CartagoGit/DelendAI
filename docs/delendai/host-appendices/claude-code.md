# Claude Code — keep the main thread cheap

> The appendix of [`AGENT-BOOTSTRAP.md`](../AGENT-BOOTSTRAP.md) for this host. Read it with the bootstrap; no other host reads it.

This repo's MCP host (`scripts/host-server.ts`) runs `--preset=swarm`,
which loads the active plugin preset. Tool *results* stay in context
for the rest of the session, so how you call these tools matters:

- **Delegate non-trivial work.** For any real change to `packages/core`,
  a plugin, the build/release scripts, or `apps/web`, use the
  `delendai-orchestrator` subagent instead of driving `proposals_*`
  tools directly from the main thread. As an operational threshold,
  treat a task as non-trivial once it needs more than 3 tool calls,
  touches multiple files, or needs repeated MCP reads to complete. It
  knows the working loop, the invariants, and the multi-agent
  coordination primitives.
- **Measure it.** `delendai usage host-sessions --since=<date>` shows each
  thread's calls and the context each call carried. A call re-reads the
  whole thread: measured on 2026-11-02, a 550k-token main thread paid
  about nine times what a subagent at 65k paid for the same task.
- **Prefer compact tools when orienting directly.** Use
  `delendai_overview` with `compact: true`, `proposals_auto_work`,
  and `proposals_compact_status` over verbose equivalents
  (`proposal_board`, full `state_health` dumps) unless you specifically
  need the verbose detail.
- **Prefer distilled recall over re-reading.** If a fact should survive
  beyond the current slice, recall it from durable memory; if it is
  only useful right now, keep it transient and compact it away when the
  task changes.
- **`/compact` between unrelated tasks.** Once a slice/proposal is
  closed and before starting unrelated work, compact — don't carry its
  tool output forward for the rest of the session.
- **Rotate before the danger zone.** At the host's context warning (or about
  100k tokens when Claude exposes the meter), checkpoint with the memory
  digest, then start a fresh session. Use `/compact` only to continue related
  work; use `/clear` before unrelated work. Do not leave an idle Claude Code
  session running in the background; a continuous session beyond two hours
  needs an intentional checkpoint, and one approaching many hours should end.
