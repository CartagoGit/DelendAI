---
id: x00992
title: "A unit that waits on the owner is not broken, and retiring says what it closes"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-28
---

# x00992 — A unit that waits on the owner is not broken, and retiring says what it closes

## goal

A unit waiting on the owner says so and is not counted as broken, and refs kept for recovery expire once their work is elsewhere.

## why

The owner, on 2026-10-28, saw the project filling with branches that never finish. Measured that day: 26 heads on the forge (16 `delendai/pr/*`, 8 `delendai/wip/*`), 14 open pull requests, 91 local refs and 10 worktrees. The volume is not thousands, but it doubles for no work:

- Every proposal I delivered that day went through two units and two pull requests: the implementation (#1528, #1534, #1537, #1542) and a `to-review` unit and PR (#1552, #1554, #1555, #1556) whose only change was `shipped-in: <merge sha>` and the move to `review/`. That was my orchestration, not the product: `proposal_transition to=review` from the implementation unit already records each slice's delivering commit (`review-entry.service.ts`) and publishes one pull request. My batch script published first and recorded afterwards; it now hands over through the transition.
- `keep-the-queue-moving` fails every hour on `work:doctor --forge` (`no-remote-work-refs`), naming two wips "silent 6 h": f00793's, waiting for the owner's sampling run (S3), whose record was already in PR #1556, and minimax's x00991, with PR #1550 open. A unit that waits on a person has no state to say so.
- Retiring that wip closed PR #1556 as well, with nothing in the retire output saying the publication went too.
- `refs/delendai/stranded/*` holds 8 local refs, the oldest a day old, for work that later reached a unit or a PR; nothing expires them.

## non-goals

- Changing the merge policy (merge commits, required checks).
- Deleting another agent's units: they are reaped by the existing lease rules.

## slices

- global_gate: type

### S1 — A unit that waits on the owner says so
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/workflow-invariants.service.ts`
- **Gate**: type
- acceptance:
  - "`work park --ref=<unit> --reason=<what it waits for>` marks a unit as waiting; `no-remote-work-refs` lists a parked unit as waiting with its reason instead of BROKEN, and the reaper leaves it."
  - "A wip whose publication holds all its commits is not reported silent."

### S2 — Retiring says what it closes, and recovery refs expire
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/stranded-edits.service.ts`
- **Gate**: type
- acceptance:
  - "`work retire` on a unit with an open pull request names the pull request it closes in its output."
  - "A stranded ref whose paths all reached develop, a unit or a publication is dropped by startup reconciliation, journalled; the others are listed by `work status` with their age."

## acceptance

- `work park --ref=<unit> --reason=<what it waits for>` marks a unit as waiting; `no-remote-work-refs` lists a parked unit as waiting with its reason instead of BROKEN, and the reaper leaves it.
- A wip whose publication holds all its commits is not reported silent.
- `work retire` on a unit with an open pull request names the pull request it closes in its output.
- A stranded ref whose paths all reached develop, a unit or a publication is dropped by startup reconciliation, journalled; the others are listed by `work status` with their age.
