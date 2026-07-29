---
id: x00186
title: "a00083 — host server, install script, and quality-gate: drop implicit cwd, sync I/O, and stale entrypoint shape"
kind: fix
status: ready
type: proposal
track: tools+audit-followup
date: 2026-07-29
related:
    - a00083 # full-project audit
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
- **Status**: ready
- **Files**: <see slice body below>
- **Gate**: test
  acceptance:

- **File**: `tools/scripts/host/host-server.script.ts#L17`.
- Parse `--workspace <abs>` from `process.argv.slice(2)`; default to `process.cwd()` ONLY when the flag is missing AND `process.env['MCP_VERTEX_WORKSPACE']` is unset; in both fallback cases, log a `[mcp-vertex] warning: using cwd as workspace` line to stderr.
- The remainder of the entrypoint uses the resolved `workspaceRoot`.
- **Acceptance**: `bun tools/scripts/host/host-server.script.ts --workspace /tmp/x --preset=lean` starts with `/tmp/x` as the workspace; without the flag it falls back to cwd + a stderr warning.

### S2 — quality-gate: async I/O + injected cwd
- **Status**: ready
- **Files**: <see slice body below>
- **Gate**: test
  acceptance:

- **File**: `tools/scripts/quality/quality-gate.script.ts#L50`.
- Replace `readFileSync` calls with the `readFile` from `node:fs/promises`.
- Read `cwd` from `process.argv` (`--workspace <abs>`) or `process.env['MCP_VERTEX_WORKSPACE']`, falling back to cwd with the same stderr warning as s1.
- Update the `IFileReader.readFile` callback to be the async variant (already async in signature — only the implementation needs to drop `Sync`).
- **Acceptance**: `bun run quality:gate` still passes; a new spec asserts the reader is async (use Bun's `process.getActiveResources()` style or count `readFileSync` calls).

## Notes



- a00083 — full-project audit (source of these findings)
- a2f3fa73 — shipped F26 + F29 (the easy ones)

## acceptance

Every slice lands with its acceptance bullets green and `bun run validate` exits 0 on a clean checkout of develop (the gate itself ships in x00189 s4).
