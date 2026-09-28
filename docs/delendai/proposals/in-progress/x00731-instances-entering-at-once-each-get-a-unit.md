---
id: x00731
title: "Instances entering at once each get a unit"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00714, x00727]
---

# x00731 — Instances entering at once each get a unit

## goal

Any number of instances of one model entering the same unit at the same
moment each get their own generation, and none can take another's.

## why

A swarm test in a throwaway repository (two `minimax-m3` instances running
`delendai review next` together) found two faults in `work enter`:

- Both chose g1, both ran `git worktree add` on the same path, and the one
  that lost rolled back the ref the other had just created: neither got a
  unit.
- With an absolute `--dir`, the unit's path was reported and its session
  stamped at `<root>//<dir>`, a path that does not exist. The next instance
  found no stamp, took g1 as free, and stamped it as its own.

## why this design

- **Choosing a generation and creating it is one step.** `work enter` holds
  the unit (agent, kind, proposal, slice; any generation) with the same
  lock `work publish` holds a ref with, across processes, and queues calls
  within one process, whose pid the lock cannot tell apart. The second
  instance waits (up to a minute), then sees g1 held by another session
  and takes g2.
- **The worktree's path is `resolve(root, dir)`**, so an absolute `--dir`
  is honoured and the session is stamped where it is read.

## non-goals

None.

## architecture

- `packages/cli/src/commands/work.command.ts`, its spec.

## Slices

- global_gate: none

### S1 — One entry at a time per unit, at the right path

- **Status**: in-progress
- **Gate**: `npx vitest run packages/cli/src/commands/work.command.spec.ts`
- **Files**:
  - `packages/cli/src/commands/work.command.ts`
  - `packages/cli/src/commands/work.command.spec.ts`

## dependency graph

None.

## acceptance

- Two sessions of `minimax-m3` entering the review batch together get g1
  and g2, each at the path it reports.
