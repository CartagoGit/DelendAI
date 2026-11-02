---
id: x01003
title: "A slice commit takes only what its own unit wrote"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-02
---

# x01003 — A slice commit takes only what its own unit wrote

## goal

commit-policy's slice persistence checkpoints into a work ref only changes the unit itself made, so a hunk another agent left in the shared checkout never enters an unrelated unit.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — Slice persistence leaves another writer's hunks out
- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/persistence/wip-persistence.ts`
- **Gate**: none
- acceptance:
  - "A slice event whose declared file holds, in the shared checkout, changes the unit did not write checkpoints none of them and says which file it left and why; a spec covers a file changed by two writers."

## acceptance

- A slice event whose declared file holds, in the shared checkout, changes the unit did not write checkpoints none of them and says which file it left and why; a spec covers a file changed by two writers.
