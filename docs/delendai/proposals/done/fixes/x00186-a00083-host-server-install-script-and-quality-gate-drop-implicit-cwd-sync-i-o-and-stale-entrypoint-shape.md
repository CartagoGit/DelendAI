---
id: x00186
title: "a00083 — host server, install script, and quality-gate: drop implicit cwd, sync I/O, and stale entrypoint shape"
kind: fix
status: done
type: proposal
track: tools+audit-followup
date: 2026-07-29
related:
    - a00083 # full-project audit
shipped-in:
    - 56b04565 # fix(x00186): host-server + quality-gate workspace resolution and async I/O
---

# x00186 — a00083 — host server, install script, and quality-gate: drop implicit cwd, sync I/O, and stale entrypoint shape

## Goal

Resolve findings F26, F27, F28, F29 from a00083 (29-07-2026). The easy/medium slice already shipped F26 (host-server `.catch` terminal) and F29 (install-script anchor to `import.meta.url`) in `a2f3fa73`; this proposal covers the remaining two and tightens the rest:

- **F27** `tools/scripts/host/host-server.script.ts#L17` — the host resolves its workspace from `process.cwd()` instead of the injected `--workspace` flag that the CLI already supports.
- **F28** `tools/scripts/quality/quality-gate.script.ts#L50` — `cwd` is implicit and the reader uses `readFileSync` (×3). Switch the reader to async I/O and thread the workspace root from a CLI flag, not from `cwd`.

(F26 and F29 were easy; shipped in `a2f3fa73`.)

## why

- **F27 (host cwd)** — launching the host from the wrong cwd silently mounts the wrong config and the wrong plugin set. The `--workspace` flag exists; the entrypoint just ignores it.
- **F28 (quality-gate cwd + sync I/O)** — the gate is the canonical close-time check; it should not block the event loop with `readFileSync` x3. AGENTS.md rule 3 forbids sync I/O in hot paths; `quality-gate` is the hottest of them.

## non-goals

- Changing the `quality:gate` command's interface. The fix only updates the implementation.
- Replacing `quality-gate.script.ts`'s `IFileReader` shape. Async + injected cwd, same shape.

## slices

### S1 — host server: thread the workspace flag
- **Status**: done
- **Files**: `tools/scripts/host/host-server.script.ts`, `tools/scripts/host/host-server.script.spec.ts`
- **Gate**: test
- acceptance:
  - "Verified empirically before touching any code: `parseCliArgs(argv, cwd)` already resolves `workspace: tokens.workspace ?? cwd` from argv itself, and `assembleCliConfig` already uses `args.workspace` (not the raw `cwd` param) for every path. A live run with `--workspace <tmp>` and a config declaring a bad plugin path produced an error referencing the tmp dir, not `process.cwd()` — F27's \"silently mounts the wrong config\" does not reproduce."
  - "What WAS missing: no `MCP_VERTEX_WORKSPACE` env-var fallback at all, and no signal when the caller silently got cwd. Added `resolveWorkspaceFlag` (parses `--workspace=<v>` and `--workspace <v>`), used as `resolveWorkspaceFlag(argv) ?? process.env.MCP_VERTEX_WORKSPACE`, falling back to `process.cwd()` with a `[mcp-vertex] warning: using cwd as workspace` stderr line — matching the acceptance bullet's fallback-warning behavior even though the flag path itself needed no fix."
  - "`resolveWorkspaceFlag` exported and unit-tested directly (5 cases: `=` form, space form, absent, trailing flag with no value, first-wins on duplicate). The top-level `run().catch(...)` boot call is now guarded by `if (import.meta.main)` so a spec file can import the pure helper without also booting a real MCP server as an import side effect."
  - "Pre-existing e2e suite (`host-graceful-shutdown.spec.ts`, spawns the real script with `--workspace=<tmp>`) re-verified green after the guard: 8/8 passing."

### S2 — quality-gate: async I/O + injected cwd
- **Status**: done
- **Files**: `tools/scripts/quality/quality-gate.script.ts`, `tools/scripts/quality/quality-gate.spec.ts`
- **Gate**: test
- acceptance:
  - "This one reproduced exactly as described: `cwd = process.cwd()` was unconditional, no `--workspace`/env support, and all 3 file reads used `readFileSync`."
  - "Replaced all 3 `readFileSync` call sites with `readFile` from `node:fs/promises`; `loadQualityScopes` is now `async` and awaited from `main`."
  - "Added the same `resolveWorkspace` precedence as S1 (`--workspace` flag > `MCP_VERTEX_WORKSPACE` env > cwd-with-warning)."
  - "New tests (4): `--workspace` overrides cwd end-to-end (config read from the flagged dir, not the spawn cwd), `MCP_VERTEX_WORKSPACE` honored when no flag is given, and the fallback warning fires only when neither is given. Pre-existing 4 tests (exit 0/1/2/2) re-verified green — the stderr assertions use `toMatch`, unaffected by the new warning line being present."
  - "`bun run quality:gate` re-verified passing standalone and as part of a full `bun run validate` run."

## Notes



- a00083 — full-project audit (source of these findings)
- a2f3fa73 — shipped F26 + F29 (the easy ones)

## acceptance

Every slice lands with its acceptance bullets green. `bun run quality:gate` and the full `bun test` suite are re-verified green after both slices (see x00189, which tracks `bun run validate`'s overall gate status — its acceptance notes the one remaining red step is an execution-environment gap unrelated to any of x00183-x00191's findings).
