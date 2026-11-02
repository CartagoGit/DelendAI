---
id: x00992
title: "A unit that waits on the owner is not broken, and retiring says what it closes"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-10-28
last-transition-id: 38f15478-9d9e-4b3f-b04a-121268f5ab08
last-correlation-id: 38f15478-9d9e-4b3f-b04a-121268f5ab08
last-transition-from: ready
last-transition-at: 2026-11-02T10:50:04.836Z
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
- **Files**: `packages/core/src/lib/contracts/constants/unit-parked.constant.ts`, `packages/core/src/lib/work-units/unit-activity.helper.ts`, `packages/core/src/lib/work-units/unit-lease.interface.ts`, `packages/core/src/lib/work-units/unit-verdict.service.ts`, `packages/core/src/lib/work-units/unit-standings.service.ts`, `packages/core/src/lib/work-units/forge-work-refs.service.ts`, `packages/core/src/lib/work-units/workflow-invariants.service.ts`, `plugins/proposals/src/lib/services/claim-liveness.service.ts`, `tools/scripts/lint/silent-work-refs.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.ts`, `packages/core/tests/src/lib/work-units/unit-activity.helper.spec.ts`, `packages/core/tests/src/lib/work-units/unit-verdict.service.spec.ts`, `packages/core/tests/src/lib/work-units/forge-work-refs.service.spec.ts`, `plugins/proposals/tests/src/lib/services/claim-liveness.service.spec.ts`, `tools/scripts/lint/silent-work-refs.spec.ts`
- **Gate**: type
- acceptance:
  - "A commit in the unit with a `Delendai-Parked: <what it waits for>` trailer marks it as waiting; `no-remote-work-refs` lists a parked unit as waiting with its reason instead of BROKEN, the unit is neither offered for adoption nor reaped (locally or by the queue), and it keeps its claims; any later commit of its own ends the wait."
  - "A wip whose publication holds all its commits is not reported silent."

### S2 — Retiring says what it closes, and recovery refs expire
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/stranded-edits.service.ts`, `packages/core/tests/src/lib/work-units/stranded-edits.service.spec.ts`
- **Gate**: type
- acceptance:
  - "`work retire` on a unit with an open pull request names the pull request it closes in its output."
  - "A stranded ref whose paths all reached develop, a unit or a publication is dropped by startup reconciliation, journalled; the others are listed by `work status` with their age."

## acceptance

- A `Delendai-Parked` trailer marks a unit as waiting; `no-remote-work-refs` lists a parked unit as waiting with its reason instead of BROKEN, and the reaper leaves it.
- A wip whose publication holds all its commits is not reported silent.
- `work retire` on a unit with an open pull request names the pull request it closes in its output.
- A stranded ref whose paths all reached develop, a unit or a publication is dropped by startup reconciliation, journalled; the others are listed by `work status` with their age.

## notes

- S2, 2026-11-02. Retiring already names what it closes: since 76f7b264a (2026-10-04) `work retire` comments on and closes each open pull request of the unit's publication and returns their numbers as `closed`; PR #1556 carries that comment. What did not expire were stranded refs whose files had landed and then moved on, because a version only counted as found when a branch tip held it byte for byte. It now also counts when the integration branch's history held it (one `git log --raw` over the stranded paths, about 0.5 s and only when stranded refs exist). Each drop is logged at start-up with its commit, so it can be restored. `work status` lists the rest oldest first with `keptAt`. Measured that day on this checkout: 11 stranded refs, none of whose files had all reached develop's history, so none goes and all 11 are listed with their age.
- S1, 2026-11-02. The mark is a trailer, not a `work park` action: every commit in a unit is already pushed with it, so the mark reaches the forge, where the queue judges refs, with no new command or ref namespace, and any later commit of the unit's own ends the wait. One reader (`parkedReason`) serves the unit standings (a new `waiting` standing), the doctor's forge invariant and the queue's reaper; the invariant's remedy names the commit to write. A wip whose tip a publication on the forge holds is no longer called silent (f00793's case: its record was in PR #1556).
