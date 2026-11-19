---
id: x01098
title: "The workflow defects of 2026-11-18 are fixed at their roots"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-18
last-transition-id: 8901b516-0ef9-4f90-b1b0-cbca667346ce
last-correlation-id: 8901b516-0ef9-4f90-b1b0-cbca667346ce
last-transition-from: ready
last-transition-at: 2026-11-18T16:56:39.520Z
---

# x01098 — The workflow defects of 2026-11-18 are fixed at their roots

## goal

Eight defects the 2026-11-18 session met in land, the shared-checkout guard, the reaper, the proposals plugin, hand-over, doctor, work enter and the derived-file lints are fixed in code, each with a spec, so no agent has to work around them again.

## why

2026-11-18 incidents (product-defects-2026-11-18): batch #2902 went red on the startup-budget spec that develop already failed after #2896, and land labelled #1957 delendai:culprit for a failure it does not own; a file named `on` (less help output, PAGER=less) appeared twice in the shared checkout (rescued 08:32) and blocked every work command; work reap listed a freshly entered unit (q00046-S5b) as would-remove and left spent f00800 S5/S7 publications for a manual retire; f00822 S1 encoded superseded-by as a reason prefix (#2995) and x01097 was flagged duplicate of f00822 despite DependsOn; hand-over validated stale Files of delivered slices (f00808 S2/S4 after the q00046 cutover); doctor flagged branch-runtime/develop and branch-runtime/main as leftovers; work enter failed intermittently with 'Could not create refs/heads/...' for f00814 and x01059; and the land-cutover scan read proposal-readiness.baseline.json (x01079). Dropped for lack of a locatable code path or because already handled: x01097 in-progress selection, hand-written shipped-in lines, the changed-spec selection of #2896 (an after-check, not code), the revalidate data amendments of ten proposals, and the retire-identity refusal.

## non-goals

- Changing the land batching or certification model beyond naming the culprit
- Amending the ten proposals whose Files are stale (a data task, not a product defect)
- Adding a retire identity check

## slices

- global_gate: lint

### S1 — Land reads the base before naming a culprit
- **Status**: pending
- **Files**: `packages/core/src/lib/integration/land/land-verdict.helper.ts`, `tools/scripts/forge/land-workflow.script.ts`, `tools/scripts/forge/land-workflow.spec.ts`
- **Gate**: lint
- **Decisions**: When the base has no certifying result yet the failing job is not re-run: no culprit is named and the batch is retried. Decided conservatively.
- acceptance:
  - "`bunx vitest run tools/scripts/forge/land-workflow.spec.ts` proves a failure already present on the base certifying result names no batch member as culprit"
  - "`bunx vitest run packages/core/tests/src/lib/integration/land/land-workflow.helper.spec.ts` stays green"

### S2 — The agent environment never pages and the guard names pager output
- **Status**: pending
- **Files**: `packages/core/src/lib/wip-engine/git-command.ts`, `packages/core/src/lib/development-policy/shared-checkout-clean.ts`, `packages/core/tests/src/lib/development-policy/shared-checkout-clean.spec.ts`
- **Gate**: lint
- **Decisions**: Only the CLI's spawned git environment is set, never the user's shell; the guard keeps refusing and only adds the explanation.
- acceptance:
  - "`bunx vitest run packages/core/tests/src/lib/development-policy/shared-checkout-clean.spec.ts` proves spawned git gets PAGER=cat and GIT_PAGER=cat and a loose file named `on` is reported as pager output"

### S3 — Reap respects the idle threshold and retires spent publications
- **Status**: pending
- **Files**: `packages/core/src/lib/ref-reconciler/clone-forge.service.ts`, `packages/core/src/lib/work-units/retired-landed.service.ts`, `packages/core/tests/src/lib/ref-reconciler/clone-forge.service.spec.ts`
- **Gate**: lint
- **Decisions**: The existing 30 minute idle threshold is reused; no new setting.
- acceptance:
  - "`bunx vitest run packages/core/tests/src/lib/ref-reconciler/clone-forge.service.spec.ts` proves an empty clean unit inside the 30 minute heartbeat window is not a would-remove and a landed spent publication is retired by reap"

### S4 — Typed superseded_by and no duplicate flag across a DependsOn chain
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/contracts/proposal-transition-input.contract.ts`, `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`, `tools/scripts/lint/proposal-hygiene.script.ts`, `tools/scripts/lint/proposal-hygiene.spec.ts`
- **Gate**: lint
- **Decisions**: superseded_by is an optional proposal id string; the reason prefix keeps being read for old records.
- acceptance:
  - "`bunx vitest run tools/scripts/lint/proposal-hygiene.spec.ts` proves a follow-up proposal chained by DependsOn is not flagged duplicate"
  - "`bunx vitest run plugins/proposals/tests/src/lib/tools/proposal-transition-checkout.spec.ts` stays green with an optional superseded_by field"

### S5 — Hand-over follows renames and deletions in delivered slices' Files
- **Status**: pending
- **Files**: `packages/cli/src/lib/work-revalidate.service.ts`, `packages/cli/src/lib/work-revalidate.service.spec.ts`
- **Gate**: lint
- **Decisions**: Only slices already delivered are exempted; the unit's own slice Files stay strictly validated.
- acceptance:
  - "`bunx vitest run packages/cli/src/lib/work-revalidate.service.spec.ts` proves a delivered slice whose file was renamed or deleted by a merged change does not block the hand-over of another slice"

### S6 — Doctor accepts the branch-runtime worktrees
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/workflow-invariants.service.ts`, `packages/core/tests/src/lib/work-units/workflow-invariants.service.e2e.spec.ts`
- **Gate**: lint
- **Decisions**: The exemption is the two branch-runtime worktree names for the integration and release branches, nothing broader.
- acceptance:
  - "`bunx vitest run packages/core/tests/src/lib/work-units/workflow-invariants.service.e2e.spec.ts` proves branch-runtime/develop and branch-runtime/main are not leftover worktrees"

### S7 — work enter and the stray-ref reap write refs under one lock
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/src/lib/work-units/unit-start-point.service.ts`, `packages/core/src/lib/ref-reconciler/stray-refs-sweep.service.ts`, `packages/core/tests/src/lib/work-units/unit-start-point.service.spec.ts`, `packages/core/tests/src/lib/ref-reconciler/stray-refs-sweep.service.e2e.spec.ts`, `new: packages/core/src/lib/work-units/ref-writer-lock.helper.ts`
- **Gate**: lint
- **Decisions**: No retry: the ref creation is serialised with the writer it races. The competing writer is the stray-ref reap (`update-ref -d` under the same refs/heads namespace); creation and reap take the same withFileMutex from ref-writer-lock.helper.ts, so `createUnitRef` becomes async.
- acceptance:
  - "`bunx vitest run packages/core/tests/src/lib/work-units/unit-start-point.service.spec.ts` runs `work enter` ref creation concurrently with the stray-ref reap deleting under the same namespace; the spec reproduces `Could not create refs/heads/...` without the lock and passes with it"
  - "`bunx vitest run packages/core/tests/src/lib/ref-reconciler/stray-refs-sweep.service.e2e.spec.ts` proves the reap and the creation take the same withFileMutex"

### S8 — Specs that skip proposals also skip files derived from them
- **Status**: pending
- **Files**: `tools/scripts/lint/proposal-readiness.script.ts`, `tools/scripts/forge/land-cutover.e2e.spec.ts`
- **Gate**: lint
- **Decisions**: The list lives next to the script that generates the baseline and is exported once.
- acceptance:
  - "`bunx vitest run tools/scripts/forge/land-cutover.e2e.spec.ts` reads the derived-from-proposals list from the single exported constant in proposal-readiness.script.ts"

## acceptance

- `bunx vitest run tools/scripts/forge/land-workflow.spec.ts` proves a failure already present on the base certifying result names no batch member as culprit
- `bunx vitest run packages/core/tests/src/lib/integration/land/land-workflow.helper.spec.ts` stays green
- `bunx vitest run packages/core/tests/src/lib/development-policy/shared-checkout-clean.spec.ts` proves spawned git gets PAGER=cat and GIT_PAGER=cat and a loose file named `on` is reported as pager output
- `bunx vitest run packages/core/tests/src/lib/ref-reconciler/clone-forge.service.spec.ts` proves an empty clean unit inside the 30 minute heartbeat window is not a would-remove and a landed spent publication is retired by reap
- `bunx vitest run tools/scripts/lint/proposal-hygiene.spec.ts` proves a follow-up proposal chained by DependsOn is not flagged duplicate
- `bunx vitest run plugins/proposals/tests/src/lib/tools/proposal-transition-checkout.spec.ts` stays green with an optional superseded_by field
- `bunx vitest run packages/cli/src/lib/work-revalidate.service.spec.ts` proves a delivered slice whose file was renamed or deleted by a merged change does not block the hand-over of another slice
- `bunx vitest run packages/core/tests/src/lib/work-units/workflow-invariants.service.e2e.spec.ts` proves branch-runtime/develop and branch-runtime/main are not leftover worktrees
- `bunx vitest run packages/core/tests/src/lib/work-units/work-unit-enter.service.spec.ts` proves a ref-creation lock conflict is retried deterministically and the refusal names the git error
- `bunx vitest run tools/scripts/forge/land-cutover.e2e.spec.ts` reads the derived-from-proposals list from the single exported constant in proposal-readiness.script.ts
