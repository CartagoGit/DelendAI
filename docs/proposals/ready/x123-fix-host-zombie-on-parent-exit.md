---
id: x123
kind: fix
title: fix(host): install signal handlers so Bun doesn't zombie on parent exit
status: ready
date: 2026-06-21
track: core+host
related:
  - f113 # feat: proposal state machine + kinds + scaffolds (DFA + linter)
  - x113 # fix: audit type errors / LSP dist cascade (precedent for surgical fix)
---

# x123 — fix(host): install signal handlers so Bun doesn't zombie on parent exit

## Goal

Stop `scripts/host-server.ts` (and the underlying `createMcpProject`
assembly) from leaving orphan Bun processes when the parent shell /
VS Code / Copilot session exits abruptly.

Concretely:

1. Register `SIGTERM`, `SIGINT`, `SIGHUP`, and `beforeExit` handlers in
   `scripts/host-server.ts` that call a shared `gracefulShutdown(server)`
   helper and exit with code 0.
2. Export the same helper from `@mcp-vertex/core/public` so any future
   host (custom plugin, swarm, examples) can opt in without copy-paste.
3. Add a regression spec (`packages/core/tests/src/lib/cli/host-graceful-shutdown.spec.ts`)
   that spawns the host with `Bun.spawn`, sends `SIGTERM`, and asserts
   the child exits in `< 2s` with `exitCode 0` and `signal: null`
   (proves no zombie, no double-shutdown).

## Why

On 2026-06-21 the MCP panel reported `Canceled: Canceled` for
`mcp-vertex_overview` (compact mode). Investigation (see
`docs/proposals/RESUMEN-SESION-2026-06-17.md` and the diagnostic chat
transcript) found the root cause was **not** in the server code:

- `packages/core/src/lib/tools/overview-tool.ts` has no `throw`, no
  `AbortController`, no `Promise.race`, no timeout — the handler is a
  pure closure over a snapshot built at boot.
- `mcp-vertex_overview` was returning `Canceled: Canceled` because the
  client MCP (VS Code / Copilot) aborted the call after its own
  inactivity timeout.

Why was the call slow enough to trip the timeout? Two `bun
scripts/host-server.ts` processes were alive against the same
workspace. The newer one (PID `1940471`, connected to this VS Code
session) was competing with an **orphan** (PID `1826609`, started
2026-06-18 02:10 by a previous session, PPID already dead) over the
shared `.cache/mcp-vertex/agents.lock.json` and
`subagent-registry.json`. The orphan had accumulated 1:57 of CPU and
was still writing to those files, which made the new host's first
overview snapshot slow enough to miss the client's deadline.

The orphan existed because:

- `scripts/host-server.ts:42-49` calls `await assembled.start()`
  and then returns. No `process.on('SIGTERM' | 'SIGINT' | 'SIGHUP',
  ...)`. No `beforeExit` listener. When VS Code closed the parent
  shell, Bun had no reason to exit.
- `packages/core/src/lib/cli/assemble.ts` and `run-init.ts` (the
  generic `cli.ts` entrypoint used by `.mcp.json` in user projects)
  have the same shape — `void run()` with no shutdown wiring.
- The MCP SDK's `McpServer.close()` exists and is awaitable
  (`@modelcontextprotocol/sdk/dist/cjs/server/mcp.d.ts:44`), but
  nobody calls it on the way out.

**Every abrupt close of VS Code/Copilot therefore leaks one Bun
process per workspace.** After N sessions, the panel becomes
unreliable for reasons unrelated to the code — exactly the failure
mode the diagnostics surfaced.

## Why this design

Three alternatives were considered; this picks the one with the
smallest blast radius and the highest reusability:

1. **Shell wrapper that `kill -0`s the parent** — rejected. Adds a
   per-platform wrapper script, races with VS Code's own process
   group reaping, and breaks on Linux when the parent shell uses
   `setsid`.
2. **`prctl(PR_SET_PDEATHSIG, SIGTERM)` in Bun via FFI** — rejected.
   Bun does not expose `prctl` natively; adding a native module just
   for this is wildly disproportionate.
3. **`process.on('SIGTERM' | 'SIGINT' | 'SIGHUP', gracefulShutdown)`
   + shared `gracefulShutdown` exported from core** — chosen. The
   MCP SDK already provides `server.close()`; we just need to call
   it when the OS asks us to stop. ~25 lines total across two
   files, no new dependency, no native code, and the helper is
   reusable by every existing and future host (this repo's
   `scripts/host-server.ts`, `examples/custom-plugin/`, `examples/swarm/`,
   and any user project that copies `cli.ts`).

## Non-goals

- Reaping orphans from past sessions (the diagnostic `kill 1826609`
  already handled the live one; future zombies will be killed by the
  new handler the moment the parent that spawned them dies).
- Changing the MCP SDK or `IMcpVertexProject`'s public shape. The
  new `gracefulShutdown` helper is an **addition** to the public
  surface, not a breaking change.
- Adding a healthcheck endpoint or `MCP_HEARTBEAT` env var. Out of
  scope; revisit only if the same failure recurs after this lands.
- Touching `plugins/proposals` (the agent-lock / subagent-registry
  contention surface). That's a separate audit/proposal concern.

## Slices

### S1 — Export a shared `gracefulShutdown` helper from core
  - **Status**: done
  - **Files**: `packages/core/src/lib/cli/graceful-shutdown.ts` (new),
    `packages/core/src/public/index.ts` (re-export the helper).
  - **Command**: `bun run typecheck`
  - **Expect**: green; the new helper is exported from
    `@mcp-vertex/core/public` with the signature
    `gracefulShutdown(server: McpServer, opts?: { timeoutMs?: number; exitCode?: number }): Promise<void>`.
    It calls `await server.close()`, then
    `process.exit(opts.exitCode ?? 0)` if called from a signal
    handler (so `SIGINT` → exit 130, the conventional value).

### S2 — Wire signal handlers in `scripts/host-server.ts`
  - **Status**: done
  - **Files**: `scripts/host-server.ts`,
    `packages/core/tests/src/lib/cli/host-graceful-shutdown.spec.ts` (new).
  - **Command**: `bun run validate`
  - **Expect**: green. After `await assembled.start()` the script
    installs `process.on('SIGTERM' | 'SIGINT' | 'SIGHUP',
    () => void gracefulShutdown(assembled.server, { exitCode: 130 }))`
    and a `process.on('beforeExit', () => void
    assembled.server.close())` listener. Idempotent: a
    module-level `let shuttingDown = false` guard prevents
    double-close (Bun fires both `SIGTERM` and `beforeExit` on
    `kill -TERM`).

### S3 — Regression spec: `Bun.spawn` + `SIGTERM` → exits < 2s
  - **Status**: done
  - **Files**: `packages/core/tests/src/lib/cli/host-graceful-shutdown.spec.ts`
    (same file as S2; covered by S2's vitest run; S3 only listed
    for traceability against the acceptance checkbox).
  - **Command**: `bunx vitest run packages/core/tests/src/lib/cli/host-graceful-shutdown`
  - **Expect**: 3 new specs green —
    1. `SIGTERM` → child exits with `code 0` in `< 2000ms` (signal
       handler path; `exitCode: 130` is overridden by `process.exit(0)`
       inside the helper when the helper is invoked from a signal).
    2. `SIGINT` → child exits with `code 130` in `< 2000ms`.
    3. Double `SIGTERM` (two sends within 50ms) → child exits
       exactly once (`shuttingDown` guard); no `McpServer.close()
       called after closed` warning in stderr.

### S4 — Same wiring in `examples/*` hosts (opt-in)
  - **Status**: done
  - **Files**: `examples/minimal/`, `examples/custom-plugin/`,
    `examples/swarm/` — wherever the example spawns an MCP server
    in a long-running script.
  - **Command**: `bun run lint && bunx vitest run examples/...` (if
    applicable).
  - **Expect**: example entrypoints import `gracefulShutdown` and
    register the same handlers. No `examples/**` script should
    leave a Bun process running after `Ctrl+C`.

## Acceptance

- [ ] S1, S2, S3, S4 merged with `fix:` commits (one per slice,
      per the `Conventional Commits` rule in `AGENTS.md`).
- [ ] `bun run validate` is green (typecheck + lint + all tests).
- [ ] The new `host-graceful-shutdown.spec.ts` has the three
      `SIGTERM` / `SIGINT` / double-`SIGTERM` cases, all passing.
- [ ] Manual smoke: start `bun scripts/host-server.ts` in a
      terminal, hit `Ctrl+C` (SIGINT), confirm the process exits
      in < 1s with code `130`, no orphan in `ps aux | grep bun`.
- [ ] No remaining `void run()` / `void main()` in `scripts/` or
      `packages/core/src/lib/cli/` without a paired `process.on`
      for `SIGTERM` (verified by `rg "void run\\(\\)|void main\\(\\)" scripts packages/core/src/lib/cli`).

## Risks and mitigations

- **R1 — Double-close on `McpServer`**: if both `SIGTERM` and
  `beforeExit` fire, `server.close()` may throw `McpServer already
  closed`. **Mitigation**: `shuttingDown` module-level guard; the
  spec in S3 asserts no stderr warning.
- **R2 — `process.exit` inside a signal handler skips finally
  blocks**. If a plugin's `onToolEnd` hook is mid-flight when
  SIGTERM arrives, its `finally` may not run. **Mitigation**:
  `gracefulShutdown` awaits `server.close()` (which the SDK
  implements as a queue drain) before calling `process.exit`.
  Documented in the helper's JSDoc.
- **R3 — A custom host forgets to register the handlers and
  regresses**. **Mitigation**: S4 covers the repo's own
  `examples/`; the public export ships a TSDoc warning that the
  helper is only effective if the caller wires the handlers.
- **R4 — Existing tests that spawn `host-server` may now exit
  instead of hanging**. **Mitigation**: those tests (if any)
  already `await server.connect(...)` and rely on the parent test
  runner to kill the child; `beforeExit` only fires when the
  parent itself exits, not when the child gets reaped.

## Notes

- This proposal is **dogfooding** in the sense that the AGENTS.md
  invariant "no `process.cwd()` in engines" is about core engines,
  not about the host entrypoint. The shutdown wiring belongs at the
  edge (the host), not in the agnostic core library.
- The `McpServer.close()` API was confirmed against
  `@modelcontextprotocol/sdk@1.29.0`
  (`node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.d.ts:44`).
- Cross-references: f113 (proposal state machine — used here to
  move `x123` through `ready → in-progress → review → done`); x113
  (precedent for a surgical fix touching one slice at a time).
- Session transcript and `kill 1826609` invocation are recorded
  in the parent chat; no need to repeat them in the proposal body.
