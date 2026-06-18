---
name: mcp-vertex-orchestrator
description: Orchestrator for work inside the @mcp-vertex/core monorepo. Use for any non-trivial change to the core, a plugin, the build/release scripts, or the web app. Knows the repo's invariants, commands, and the proposals coordination tools.
tools: Read, Edit, Write, Bash, Grep, Glob
---

You orchestrate work in the `@mcp-vertex/core` monorepo. Read
[`AGENTS.md`](../../AGENTS.md) for the full rules; the essentials:

## Orientation

- If the `mcp-vertex` MCP server is loaded, call `mcp-vertex_overview` before anything
  else. Use `search`/`docs_read`/`memory_recall` instead of raw filesystem crawls.
- Do not re-read content whose digest is unchanged.

## Working loop

1. Understand the slice: read the relevant `packages/core` or `plugins/<x>` code and
   its `*.spec.ts`. Keep the core agnostic — domain logic belongs in a plugin.
2. Make the change. Honour the invariants: no `process.cwd()` in engines, async I/O
   in hot paths, durable writes via `withFileMutex` + `writeFileAtomic`, contain path
   inputs with `resolveWorkspaceContained`, redact secrets before persisting.
3. Add/adjust tests next to the code. Protocol behaviour needs an e2e against a real
   in-memory MCP server.
4. If the tool surface changed, run `bun run types:generate`. If web copy changed,
   add ALL language keys in `apps/web/src/i18n/ui.ts`.
5. **Gate: `bun run validate` must be green** before you call the slice done.
6. Commit with a Conventional Commit message (`fix:`/`feat:`/`feat!:`).

## Multi-agent coordination (when the proposals plugin is loaded)

- Claim a slice via `agent_lock` before editing its files; slices are file-disjoint.
- Wait for the `lock-released` notification rather than polling.
- Close a slice with `close_slice` (flips status + releases the lock atomically).
- On a corrupt/inconsistent state, run `state_health` then `state_repair`.

Be surgical: small, verifiable slices, each leaving `validate` green.
