---
id: x01020
title: "The host maintenance is kept per workspace, not once per process"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-04
---

# x01020 — The host maintenance is kept per workspace, not once per process

## goal

Two workspaces served by one process each get their own maintenance gate, never the other's.

## why

External audit finding 2 (ChatGPT, 2026-11-04, against develop f7f53bf8d), P1: `currentHostMaintenance()` in `packages/core/src/lib/development-policy/maintenance-lease.service.ts` returns a module singleton, so two workspaces served by one process could be handed the other's maintenance. This is an external audit's claim; I verified it by reading the code: `processMaintenance` is a module-level `let` and `currentHostMaintenance` takes no argument, so the last maintenance made in the process wins for every caller, and `plugins/commit-policy/src/index.ts` asks that gate to stand down work for whichever workspace it runs in. I did not run a two-server reproduction (docs-only unit); S1's spec is that reproduction.

## non-goals

- Changing the lease file format or its ttl, which x01010 owns.
- Running several workspaces in one process on purpose: this only stops one from borrowing another's gate.

## slices

- global_gate: none

### S1 — The maintenance of a server is looked up by its workspace
- **Status**: done
- **Files**: `packages/core/src/lib/development-policy/maintenance-lease.service.ts`, `packages/core/src/lib/cli/assemble.ts`, `plugins/commit-policy/src/index.ts`, `packages/core/tests/src/lib/development-policy/current-host-maintenance.spec.ts`
- **Gate**: type
- acceptance:
  - "currentHostMaintenance takes the workspace root and returns the maintenance made for that workspace only; a spec starts two servers on two workspaces in one process and each plugin call gets its own workspace maintenance, never the other one"

## acceptance

- currentHostMaintenance takes the workspace root and returns the maintenance made for that workspace only; a spec starts two servers on two workspaces in one process and each plugin call gets its own workspace maintenance, never the other one
