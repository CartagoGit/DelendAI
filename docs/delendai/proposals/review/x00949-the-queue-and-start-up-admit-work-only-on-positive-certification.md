---
id: x00949
title: "The queue and start-up admit work only on positive certification"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 2406ca93-19b0-4d4c-9a23-0f8b999496a2
last-correlation-id: 2406ca93-19b0-4d4c-9a23-0f8b999496a2
last-transition-from: in-progress
last-transition-at: 2026-10-24T16:19:56.129Z
shipped-in:
  - "1b69e8c34ebeea829de02132f71b89acb4b3328d"
---

# x00949 — The queue and start-up admit work only on positive certification

## goal

The queue arms a candidate only when every required check on its current head succeeded; start-up reads all check verdicts, imports journal events by identity, and marks a checkpoint integrated only by its own head; the CI planner runs the gates of the scripts a change touches; and the stale-candidate report stops failing the queue.

## why

gpt-6.1-sol's contribution to a00095: MAINT-05 the queue arms accepted candidates before integration certification is green; MAINT-06 incremental journal import permanently skips events published late with an older source timestamp; MAINT-07 start-up generation validation depends on the check response order instead of all verdicts; MAINT-08 a merged PR can mark a different checkpoint head integrated through a ref-name fallback; MAINT-09 the GitHub integration adapter reports merged without validating the merge response; ORCH-05 the CI plan omits gates for changes to their own scripts. a00095 G83: the queue fails recurrently in report-stale-candidates (9 of 58 runs).

## non-goals

- Deleting refs (x00948).
- CI duration (the ci-speed proposal).

## slices

- global_gate: type

### S1 — The queue arms on positive evidence
- **Status**: done
- **Files**: `tools/scripts/forge/keep-the-queue-moving.script.ts`, `tools/scripts/forge/queue-arming.ts`, `tools/scripts/forge/queue-arming.interface.ts`, `tools/scripts/forge/queue-arming.spec.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`
- **Gate**: type
- acceptance:
  - "A candidate with a pending, missing or failed required check on its current head is not armed; a spec feeds a check-run list with one pending required check and gets 'not armed' (MAINT-05)."
  - "The reap tolerates a candidate whose branch vanished between the listing and the deletion: `deleteForgeBranch` answers 'gone' and the run goes on, proved by a spec; the stale-candidate doctor still fails on a real stall, by design (G83)."
- shipped-in: `506741770b0b`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 1b69e8c34ebe, validate exit 0 and tests 64/64 claimed, no recorded run cited; acceptance 2/2: (1) queue-arming.spec.ts proves it: the case 'arms nothing while one required check is still running' asserts {passed:false, pending:['delendai-validate']} for a c… (2) ref-lifecycle-guard.script.ts:387 adds deleteForgeBranch returning deleted, gone or failed; the call site at :558 logs and continues on failed and treats gone … — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. The slice's own specs ran green (3 files / 64 tests). Two observations that do not affect the verdict: the proposal's goal line about the stale-candidate report stopping the queue is not delivered by this slice, because the red step of that job is the doctor, which no slice touched; and the arming is proven at verdict level, not at the queue's landing set.

### S2 — Start-up reads every verdict and the journal by identity
- **Status**: done
- **Files**: `packages/core/src/lib/startup-reconciler/journal-publish.service.ts`, `packages/core/src/lib/startup-reconciler/journal-ref.service.ts`, `packages/core/src/lib/startup-reconciler/phases/import-journal.ts`, `packages/core/src/lib/startup-reconciler/phases/reconcile-forge.ts`, `packages/core/src/lib/startup-reconciler/seams.interface.ts`, `packages/core/src/lib/startup-reconciler/reconcile-startup.ts`, `packages/core/tests/src/lib/startup-reconciler/reconcile-forge.spec.ts`, `packages/core/tests/src/lib/startup-reconciler/idempotency.spec.ts`
- **Gate**: type
- acceptance:
  - "Journal import has no timestamp cursor: every event is replayed and the content-derived event id decides what is new, so an event published late with an older timestamp is imported; idempotency.spec proves it on a warm machine (MAINT-06)."
  - "Generation validation aggregates all check runs of the head; reordering the response changes nothing (MAINT-07)."
  - "A checkpoint is marked integrated only when the merged PR's head sha equals it; the ref-name fallback is gone (MAINT-08)."
- shipped-in: `abc0fef4c0de`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — The forge adapter checks the merge it reports
- **Status**: done
- **Files**: `packages/core/src/lib/integration-engine/github-forge.ts`, `packages/core/tests/src/lib/integration-engine/github-forge.spec.ts`
- **Gate**: type
- acceptance:
  - "A merge response without `merged: true` and a sha is a failed merge step (MAINT-09)."
- shipped-in: `b926cfd10134`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 1b69e8c34ebe, validate exit 0 and tests 10/10 claimed, no recorded run cited; acceptance 1/1: (1) github-forge.ts:354 returns {status:'failed', mergeSha:'', integrationSha: current.sha} when the merge body has no merged:true and no sha, before any ref read … — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. The slice touched exactly its two declared files, no later commit changed them, and its own spec is green (1 file / 10 tests, exit 0).

### S4 — CI runs the gates of the scripts a change touches
- **Status**: done
- **Files**: `tools/scripts/ci/job-scope.constant.ts`, `tools/scripts/ci/job-scope.script.spec.ts`
- **Gate**: type
- acceptance:
  - "A change to build.script.ts, build-clean.script.ts or pack.script.ts selects the build and pack-smoke jobs; a spec on job-scope proves each mapping (ORCH-05)."
- shipped-in: `dcf6e1248619`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- A candidate with a pending, missing or failed required check on its current head is not armed; a spec feeds a check-run list with one pending required check and gets 'not armed' (MAINT-05).
- The reap tolerates a candidate whose branch vanished between the listing and the deletion: `deleteForgeBranch` answers 'gone' and the run goes on, proved by a spec; the stale-candidate doctor still fails on a real stall, by design (G83).
- Journal import has no timestamp cursor: every event is replayed and the content-derived event id decides what is new, so an event published late with an older timestamp is imported; idempotency.spec proves it on a warm machine (MAINT-06).
- Generation validation aggregates all check runs of the head; reordering the response changes nothing (MAINT-07).
- A checkpoint is marked integrated only when the merged PR's head sha equals it; the ref-name fallback is gone (MAINT-08).
- A merge response without `merged: true` and a sha is a failed merge step (MAINT-09).
- A change to build.script.ts, build-clean.script.ts or pack.script.ts selects the build and pack-smoke jobs; a spec on job-scope proves each mapping (ORCH-05).
