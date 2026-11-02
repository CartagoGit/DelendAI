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

Cut from x00990 S6 on 2026-11-02, where it was analysed. On 2026-10-28 a `package.json` hunk that another agent left uncommitted in the shared checkout was committed into two of `minimax-m3.1-flash-preview`'s units (`implement/x00950-S3-g1`, `implement/x00956-S2-g1`) as their only change. The per-call commit (`commit-call-writes.ts`) cannot do that: it commits only paths whose state changed in the unit's own worktree during the call. The commits came from commit-policy's slice persistence, which checkpoints the slice's declared Files from the shared checkout into the work ref, whoever changed them, so every unit whose slice named `package.json` took the hunk.

Checkpointing from the shared checkout is a supported route here (`work checkpoint --paths`, persistence `wip-ref` with exact scope), so refusing it is not the fix, and git cannot say who wrote which hunk of a file. What the persistence can know is what its unit already holds and what it saw change: a design is needed before code.

## non-goals

- The per-call commit in a unit's worktree, which already commits only what the call changed.
- Refusing `work checkpoint` from the shared checkout.

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
