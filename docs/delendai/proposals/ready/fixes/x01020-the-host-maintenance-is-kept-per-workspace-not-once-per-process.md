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

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — The maintenance of a server is looked up by its workspace
- **Status**: pending
- **Files**: `packages/core/src/lib/development-policy/maintenance-lease.service.ts`
- **Gate**: type
- acceptance:
  - "currentHostMaintenance takes the workspace root and returns the maintenance made for that workspace only; a spec starts two servers on two workspaces in one process and each plugin call gets its own workspace maintenance, never the other one"

## acceptance

- currentHostMaintenance takes the workspace root and returns the maintenance made for that workspace only; a spec starts two servers on two workspaces in one process and each plugin call gets its own workspace maintenance, never the other one
