---
id: x00992
title: "A unit that waits on the owner is not broken, and retiring says what it closes"
kind: fix
status: done
type: proposal
track: a00095-consistency
date: 2026-10-28
last-transition-id: 0aa60014-1c94-4c8c-aabf-01fe78fe08c4
last-correlation-id: 0aa60014-1c94-4c8c-aabf-01fe78fe08c4
last-transition-from: review
last-transition-at: 2026-11-02T22:41:53.987Z
shipped-in:
  - "9e8af977fa511499f3eed03211ab7a8625efc6fc"
  - "880aaa2ed55dbf1b48a3dc48dae6079e4f0987c5"
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
- **Status**: done
- **Files**: `packages/core/src/lib/contracts/constants/unit-parked.constant.ts`, `packages/core/src/lib/work-units/unit-activity.helper.ts`, `packages/core/src/lib/work-units/unit-lease.interface.ts`, `packages/core/src/lib/work-units/unit-verdict.service.ts`, `packages/core/src/lib/work-units/unit-standings.service.ts`, `packages/core/src/lib/work-units/forge-work-refs.service.ts`, `packages/core/src/lib/work-units/workflow-invariants.service.ts`, `plugins/proposals/src/lib/services/claim-liveness.service.ts`, `tools/scripts/lint/silent-work-refs.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.ts`, `packages/core/tests/src/lib/work-units/unit-activity.helper.spec.ts`, `packages/core/tests/src/lib/work-units/unit-verdict.service.spec.ts`, `packages/core/tests/src/lib/work-units/forge-work-refs.service.spec.ts`, `plugins/proposals/tests/src/lib/services/claim-liveness.service.spec.ts`, `tools/scripts/lint/silent-work-refs.spec.ts`, `tools/scripts/lint/no-empty-commits.script.ts`, `tools/scripts/lint/no-empty-commits.script.spec.ts`
- **Gate**: type
- acceptance:
  - "A commit in the unit with a `Delendai-Parked: <what it waits for>` trailer marks it as waiting; `no-remote-work-refs` lists a parked unit as waiting with its reason instead of BROKEN, the unit is neither offered for adoption nor reaped (locally or by the queue), and it keeps its claims; any later commit of its own ends the wait."
  - "A wip whose publication holds all its commits is not reported silent."
- shipped-in: `0b4ae2991775`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 9e8af977fa51, validate exit 0 and tests 35/35 claimed, no recorded run cited; acceptance 2/2: (1) At 9e8af977 the parked trailer is read from the unit's latest own commit, the unit is listed as waiting with the reason instead of broken, it is not offered fo… (2) At 9e8af977 a work ref whose publication branch already holds all of its commits is not reported at all; the spec asserts that one whose publication holds its … — Approved on the delivered state of 9e8af977fa511499f3eed03211ab7a8625efc6fc. A unit whose owner parked it with the trailer is asked for rather than treated as broken: it is listed as waiting with the reason, it is not offered for adoption, neither the local reaper nor the queue touches it, it keeps its claims, and a later commit of its own ends the wait. The type gate exited 0 and the six slice specs pass 35 of 35. Four residuals, recorded and not blocking: the queue reads the park marker from the forge branch tip while the core reads it from the unit's latest own commit, so a unit whose tip is a merge would be seen as parked by one reader and not by the other; the rule that every hanging ref must be waiting is not pinned at the invariant level; nothing pins that a waiting unit is not reaped locally nor offered for adoption; and the queue's marker check is case-sensitive while git matches trailer keys without regard to case.

### S2 — Retiring says what it closes, and recovery refs expire
- **Status**: done
- **Files**: `packages/core/src/lib/work-units/stranded-edits.service.ts`, `packages/core/tests/src/lib/work-units/stranded-edits.service.spec.ts`
- **Gate**: type
- acceptance:
  - "`work retire` on a unit with an open pull request names the pull request it closes in its output."
  - "A stranded ref whose paths all reached develop, a unit or a publication is dropped by startup reconciliation, journalled; the others are listed by `work status` with their age."
- shipped-in: `cb3f7db50ee5`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 880aaa2ed55d, validate exit 0 and tests 7/7 claimed, no recorded run cited; acceptance 2/2: (1) At 880aaa2e retiring a unit lists the open pull requests it closes, closes them, and returns their numbers, which the command prints; the slice spec passes 7 o… (2) At 880aaa2e the startup reconciliation drops the stranded refs whose paths all reached develop, a unit or a publication, journals the drop with the ref and the… — Approved on the delivered state of 880aaa2ed55dbf1b48a3dc48dae6079e4f0987c5. Retiring a unit names the pull requests it closes, and the startup reconciliation drops the stranded refs that keep nothing found nowhere else, journals the drop, and lists the rest by age. The type gate exited 0 and the slice spec passes 7 of 7. Two residuals, recorded and not blocking: the retiring half that names and closes the pull requests is not pinned by any test, it came with an earlier commit than this delivery and the proposal's own notes say so; and the drop is journalled into the log rather than into the work status payload.

## acceptance

- A `Delendai-Parked` trailer marks a unit as waiting; `no-remote-work-refs` lists a parked unit as waiting with its reason instead of BROKEN, and the reaper leaves it.
- A wip whose publication holds all its commits is not reported silent.
- `work retire` on a unit with an open pull request names the pull request it closes in its output.
- A stranded ref whose paths all reached develop, a unit or a publication is dropped by startup reconciliation, journalled; the others are listed by `work status` with their age.

## notes

- S2, 2026-11-02. Retiring already names what it closes: since 76f7b264a (2026-10-04) `work retire` comments on and closes each open pull request of the unit's publication and returns their numbers as `closed`; PR #1556 carries that comment. What did not expire were stranded refs whose files had landed and then moved on, because a version only counted as found when a branch tip held it byte for byte. It now also counts when the integration branch's history held it (one `git log --raw` over the stranded paths, about 0.5 s and only when stranded refs exist). Each drop is logged at start-up with its commit, so it can be restored. `work status` lists the rest oldest first with `keptAt`. Measured that day on this checkout: 11 stranded refs, none of whose files had all reached develop's history, so none goes and all 11 are listed with their age.
- S1, 2026-11-02. The mark is a trailer, not a `work park` action: every commit in a unit is already pushed with it, so the mark reaches the forge, where the queue judges refs, with no new command or ref namespace, and any later commit of the unit's own ends the wait. One reader (`parkedReason`) serves the unit standings (a new `waiting` standing), the doctor's forge invariant and the queue's reaper; the invariant's remedy names the commit to write. A wip whose tip a publication on the forge holds is no longer called silent (f00793's case: its record was in PR #1556).
- S1, reopened 2026-11-02: the first unit parked here could not be pushed. `no-empty-commits` refuses any commit whose tree equals its parent's, because empty slice commits once claimed work that was not there, and parking is an empty commit by design. A commit carrying the `Delendai-Parked` trailer claims no work and is exempt; every other empty commit is still refused.
