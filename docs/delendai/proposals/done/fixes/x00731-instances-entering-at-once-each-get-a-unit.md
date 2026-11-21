---
id: x00731
title: "Instances entering at once each get a unit"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00714, x00727]
last-transition-id: e58ba19e-05fa-46bc-bb83-a3e6c1881fb7
last-correlation-id: e58ba19e-05fa-46bc-bb83-a3e6c1881fb7
last-transition-from: review
shipped-in:
  - "421459dc0"
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

- **Status**: done
- **Gate**: `npx vitest run packages/cli/src/commands/work.command.spec.ts`
- **Files**:
  - `packages/cli/src/commands/work.command.ts`
  - `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 421459dc0 (x00731 S1, merge PR #600). fix(cli): instances entering at once each get a unit. work-claim.command garantiza que cada instancia concurrente recibe una unidad distinta (no comparte lock ni work ref). 5/5 verde en work-claim.command.spec.ts. claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5-5 from Merge pull request #600 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00731-all-g1/instances-entering-at-once-each-get-a-unit (refs/heads/delendai/wip/claude-opus-5-5/implement/x00731-all-g1/instances-entering-at-once-each-get-a-unit) (421459dc071f97f6abd2d7a711ace5e4459452c3), opened by minimax-m3

## dependency graph

None.

## acceptance

- Two sessions of `minimax-m3` entering the review batch together get g1
  and g2, each at the path it reports.
