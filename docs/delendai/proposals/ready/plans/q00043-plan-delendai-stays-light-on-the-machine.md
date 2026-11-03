---
id: q00043
title: "Plan: delendai stays light on the machine"
kind: plan
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-03
---

# q00043 — Plan: delendai stays light on the machine

## goal

delendai uses little disk, CPU and processes on the owner's machine: one install shared by units, one working server per workspace, idle servers at zero CPU, background work at low priority, one MCP entry per host.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — A unit worktree reuses the shared checkout dependencies
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/unit-dependencies.service.ts`
- **Gate**: type
- acceptance:
  - "work enter links the worktree node_modules to the shared checkout when both lockfiles are identical, and installs only when they differ or the shared checkout has none."

### S2 — Several servers on one workspace do the work once
- **Status**: pending
- **Files**: `tools/scripts/host/host-server.script.ts`
- **Gate**: type
- acceptance:
  - "Only the lease holder polls and maintains; other servers serve their session and stay idle."

### S3 — An idle server costs no CPU
- **Status**: pending
- **Files**: `tools/scripts/host/host-idle-cost.script.ts`
- **Gate**: type
- acceptance:
  - "The idle 6 percent CPU is attributed by profile and removed; an idle server measures near zero."

### S4 — Background maintenance and proofs run niced and capped
- **Status**: pending
- **Files**: `tools/scripts/git/hydrate-candidates-after-merge.script.ts`
- **Gate**: type
- acceptance:
  - "Maintenance and proofs run at low OS priority with capped parallelism by default."

### S5 — init writes one MCP entry per host
- **Status**: pending
- **Files**: `packages/cli/src/lib/init/init-development-setup.service.ts`
- **Gate**: type
- acceptance:
  - "init writes one MCP entry for an editor that loads both .vscode/mcp.json and .mcp.json, not two."

## acceptance

- work enter links the worktree node_modules to the shared checkout when both lockfiles are identical, and installs only when they differ or the shared checkout has none.
- Only the lease holder polls and maintains; other servers serve their session and stay idle.
- The idle 6 percent CPU is attributed by profile and removed; an idle server measures near zero.
- Maintenance and proofs run at low OS priority with capped parallelism by default.
- init writes one MCP entry for an editor that loads both .vscode/mcp.json and .mcp.json, not two.
