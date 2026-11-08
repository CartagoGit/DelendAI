---
id: i00005
title: "Integration machinery is rehearsed before it ships, and a train failure is not blamed on a member"
kind: infra
status: in-progress
type: proposal
track: general
date: 2026-11-08
last-transition-id: a8c19e0d-4f6d-4d98-a0a0-c5037d9207b9
last-correlation-id: a8c19e0d-4f6d-4d98-a0a0-c5037d9207b9
last-transition-from: ready
last-transition-at: 2026-11-08T19:13:03.797Z
---

# i00005 — Integration machinery is rehearsed before it ships, and a train failure is not blamed on a member

## goal

On 2026-11-08 the merge train failed in production five times, one layer at a time (forge ruleset refused train refs; pre-push guard refused them; post-merge refresh committed an empty catalog; derived files went stale and drift-check refused the push; commit-branch-discipline refused the train's CI checkout), each found only when the live queue failed. Then bisection marked #1861, a one-member train of a green PR, as culprit. Rehearse a train with every gate its run and push will meet before the machinery ships, never blame a member for a train that is red on its own, and read 'running in the project's CI' from one agnostic place.

## why

Integration machinery that is only exercised by the live queue fails the queue for every member, and blaming an innocent member hides the defect in the train. Product principles: robust, agnostic, bounded.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — Train rehearsal
- **Status**: pending
- **Files**: `tools/scripts/forge/train-rehearsal.ts`, `tools/scripts/forge/train-rehearsal.interface.ts`, `tools/scripts/forge/train-rehearsal.script.ts`, `tools/scripts/forge/train-rehearsal.spec.ts`, `tools/scripts/forge/train-assembly.ts`, `tools/scripts/ci/prove-plan.script.ts`, `tools/scripts/ci/prove-plan.script.spec.ts`, `package.json`
- **Gate**: none
- acceptance:
  - "A script builds a train as assembleTrain does (scratch worktree, linked dependencies, merges, one regeneration), runs the installed pre-push hooks with the train ref on stdin plus the static and governance lint jobs the plan selects, and reports every failure in one pass"
  - "A change under tools/scripts/forge, tools/scripts/ci, the guard, .github/workflows or lefthook.yml runs the rehearsal in the fast proof"
  - "The measured cost of a rehearsal is recorded in the slice hand-over and bounded by a timeout"

### S2 — Honest bisection
- **Status**: pending
- **Files**: `tools/scripts/forge/queue-order.ts`, `tools/scripts/forge/queue-order.interface.ts`, `tools/scripts/forge/queue-order.spec.ts`, `tools/scripts/forge/train-fallback.ts`, `tools/scripts/forge/train-fallback.spec.ts`, `tools/scripts/forge/keep-the-queue-moving.script.ts`
- **Gate**: none
- acceptance:
  - "A one-member train that fails while the member's own required checks are green writes no culprit marker and reports 'the train's own checks are red: <jobs>'"
  - "One issue for it is opened or refreshed, and the members take the individual landing path"
  - "Specs cover the exonerated member and the still-blamed member"

### S3 — CI detection is agnostic
- **Status**: pending
- **Files**: `packages/core/src/lib/work-identity/ci-environment.helper.ts`, `packages/core/tests/src/lib/work-identity/ci-environment.helper.spec.ts`, `packages/core/src/lib/development-policy/project-branches.ts`, `packages/core/src/cli.ts`
- **Gate**: none
- acceptance:
  - "One shared reader answers 'running in the project CI' from the CI providers' own markers, and CI=true counts only when no agent marker is set"
  - "project-branches uses it"
  - "The c00537 S7 time-budget runner (PR 1841) adopts it once that PR lands; until then this is a recorded follow-up"

## acceptance

- A script builds a train as assembleTrain does (scratch worktree, linked dependencies, merges, one regeneration), runs the installed pre-push hooks with the train ref on stdin plus the static and governance lint jobs the plan selects, and reports every failure in one pass
- A change under tools/scripts/forge, tools/scripts/ci, the guard, .github/workflows or lefthook.yml runs the rehearsal in the fast proof
- The measured cost of a rehearsal is recorded in the slice hand-over and bounded by a timeout
- A one-member train that fails while the member's own required checks are green writes no culprit marker and reports 'the train's own checks are red: <jobs>'
- One issue for it is opened or refreshed, and the members take the individual landing path
- Specs cover the exonerated member and the still-blamed member
- One shared reader answers 'running in the project CI' from the CI providers' own markers, and CI=true counts only when no agent marker is set
- project-branches uses it
- The c00537 S7 time-budget runner (PR 1841) adopts it once that PR lands; until then this is a recorded follow-up

## Notes

- S3: the c00537 S7 time-budget runner (PR #1841, still open when this landed) detects CI with `GITHUB_ACTIONS`; it adopts `isRunningInProjectCi` from `@delendai/core/cli` once #1841 lands. `plugins/proposals/src/lib/services/proposal-state.ts` (`isCiEnvironment`) still reads the two variables itself.
- S1 cost, measured once on this unit (`bun run forge:rehearse-train`, nice 19): 9 gates in 173 s wall, 440 s CPU, 1.1 GB peak RSS; the slowest gate is lint-security (101 s), the pre-push hooks take 51 s. Excluded on purpose: quality-gate and tokens-budget-real (they build the repository; the train's own run proves them). Each gate has a timeout (default 900 s, `--timeout=`), concurrency is half the cores (`PROVE_PARALLEL`).
- S2: a red leaf train whose member's own required checks are green is reported as "the train's own checks are red", writes no culprit marker, opens or refreshes one issue ("merge train red on its own checks"), and the accepted members land by their own merge. A member inferred red from a green first half is still blamed.
