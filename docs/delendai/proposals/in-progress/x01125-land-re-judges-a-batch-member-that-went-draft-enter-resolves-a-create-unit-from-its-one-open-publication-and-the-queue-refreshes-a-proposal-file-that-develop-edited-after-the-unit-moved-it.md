---
id: x01125
title: "Land re-judges a batch member that went draft, enter resolves a create unit from its one open publication, and the queue refreshes a proposal file that develop edited after the unit moved it"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-21
last-transition-id: c9c291cf-56a1-4fec-85c1-866457359b54
last-correlation-id: c9c291cf-56a1-4fec-85c1-866457359b54
last-transition-from: ready
last-transition-at: 2026-11-21T10:53:14.868Z
---

# x01125 — Land re-judges a batch member that went draft, enter resolves a create unit from its one open publication, and the queue refreshes a proposal file that develop edited after the unit moved it

## goal

Three frictions of the land queue and unit entry seen on 2026-11-21 are removed: an open batch is dropped when a member turned draft or unready, `work enter --proposal=<id>` resolves a create unit from its one open publication, and a publication whose only conflict is its own moved proposal file is refreshed by the queue.

## why

(E) settleBatch in packages/core/src/lib/integration/land/land.helper.ts re-judges an open batch only by a missing record, red checks, all members closed, a changed member head and a moved integration tip; it never reads a member's draft flag, which land.helper.ts reads at the pull request and only the repair path judges (land-revert.helper.ts, repair readiness). Batch #3413 was opened for #3412 seconds before #3412 went draft and was closed by hand. (D) `work enter --proposal=x01124` for a create unit was refused with rc=4 because kind, slice, generation and topic were not named; the proposal had exactly one open publication, which names all four (x01124 needed --kind=create --slice=all --generation=3 --topic=work). withReviewKind in packages/core/src/lib/work-units/review-kind.service.ts already completes kind from the proposal's folder; the publication is the same kind of evidence. (C) #3409 held a proposal moved ready to review in the PR while develop edited its in-progress copy: the only conflict with develop was that rename/modify, and the PR waited for its author. The queue knows both blobs and the moved path, so the refresh is deterministic.

## non-goals

- Changing which pull requests are batched or the batch size
- Resolving any conflict other than a proposal file the unit itself moved
- Choosing a kind or generation when the proposal has zero or several open publications

## slices

- global_gate: none

### S1 — An open batch is closed and rebuilt when a member turned draft
- **Status**: pending
- **Files**: `packages/core/src/lib/integration/land/land.helper.ts`, `tools/scripts/forge/land-batches.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "land-batches.spec.ts: an open batch none of whose members has merged is closed when one member's pull request is draft, its other members are rebuilt into a new batch without it, and the pass log names the draft member."
  - "land-batches.spec.ts: once a member of the batch has merged, a member turning draft does not close the batch and the pass log says the batch finishes as opened."
  - "nice -n 19 bunx vitest run tools/scripts/forge/land-batches.spec.ts passes."

### S2 — work enter for a create unit resolves its coordinates from its one open publication
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `new:packages/core/src/lib/work-units/open-publication-coordinates.service.ts`, `packages/core/tests/src/lib/work-units/work-unit-enter.service.e2e.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "work-unit-enter.service.e2e.spec.ts: with exactly one open publication for the proposal and only --proposal given, enter returns the worktree of the unit that publication names (kind, slice, generation and topic taken from its ref) instead of a refusal."
  - "work-unit-enter.service.e2e.spec.ts: with zero or two open publications for the proposal, enter is refused as today and names the flags to give."
  - "nice -n 19 bunx vitest run packages/core/tests/src/lib/work-units/work-unit-enter.service.e2e.spec.ts passes."

### S3 — The queue refreshes a publication whose only conflict is its own moved proposal file
- **Status**: pending
- **Files**: `packages/core/src/lib/integration/land/land-bring-forward.helper.ts`, `packages/core/tests/src/lib/integration/land/land-bring-forward.helper.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "land-bring-forward.helper.spec.ts: a head that moved a proposal from in-progress/ to review/ while the tip edited the in-progress/ copy is brought forward with the tip's edit carried onto the review/ copy and the in-progress/ copy removed."
  - "land-bring-forward.helper.spec.ts: when the tip's edit does not apply cleanly to the moved copy, or any other path conflicts, nothing is changed and the pull request gets one comment naming `work enter --generation <n>` and `git merge`."
  - "nice -n 19 bunx vitest run packages/core/tests/src/lib/integration/land/land-bring-forward.helper.spec.ts passes."

### S4 — The queue's conflict path calls refreshMovedProposal through a real git port
- **Status**: pending
- **Files**: `packages/core/src/cli.ts`, `packages/core/src/lib/integration/land/land-bring-forward.helper.ts`, `packages/core/src/lib/integration/land/land-moved-proposal.interface.ts`, `packages/core/src/lib/integration/land/land.helper.ts`, `packages/core/src/lib/integration/land/land.interface.ts`, `packages/core/src/lib/integration/land/land-authored-conflict.helper.ts`, `packages/core/tests/src/lib/integration/land/land-authored-conflict.helper.spec.ts`, `plugins/integration/src/lib/contracts/interfaces/integration-pass.interface.ts`, `plugins/integration/src/lib/services/integration-pass.service.ts`, `plugins/integration/src/lib/services/land-refresh-moved.helper.ts`, `plugins/integration/tests/src/lib/services/land-refresh-moved.e2e.spec.ts`
- **Gate**: type
- **Decisions**: none
- **DependsOn**: [S1, S3]
- acceptance:
  - "land-refresh-moved.e2e.spec.ts: through landPass, a head that moved a proposal from in-progress/ to review/ while the tip edited the in-progress/ copy is refreshed by the queue path (the edit carried, the in-progress/ copy removed, pushed without force) and the pushed head merges the tip cleanly."
  - "land-refresh-moved.e2e.spec.ts: the same spec: when the edit does not apply, the pull request gets exactly one comment naming `work enter --generation <n>` and `git merge` and nothing is pushed."
  - "nice -n 19 bunx vitest run plugins/integration/tests/src/lib/services/land-refresh-moved.e2e.spec.ts passes."

## acceptance

- land-batches.spec.ts: an open batch none of whose members has merged is closed when one member's pull request is draft, its other members are rebuilt into a new batch without it, and the pass log names the draft member.
- land-batches.spec.ts: once a member of the batch has merged, a member turning draft does not close the batch and the pass log says the batch finishes as opened.
- nice -n 19 bunx vitest run tools/scripts/forge/land-batches.spec.ts passes.
- work-unit-enter.service.e2e.spec.ts: with exactly one open publication for the proposal and only --proposal given, enter returns the worktree of the unit that publication names (kind, slice, generation and topic taken from its ref) instead of a refusal.
- work-unit-enter.service.e2e.spec.ts: with zero or two open publications for the proposal, enter is refused as today and names the flags to give.
- nice -n 19 bunx vitest run packages/core/tests/src/lib/work-units/work-unit-enter.service.e2e.spec.ts passes.
- land-bring-forward.helper.spec.ts: a head that moved a proposal from in-progress/ to review/ while the tip edited the in-progress/ copy is brought forward with the tip's edit carried onto the review/ copy and the in-progress/ copy removed.
- land-bring-forward.helper.spec.ts: when the tip's edit does not apply cleanly to the moved copy, or any other path conflicts, nothing is changed and the pull request gets one comment naming `work enter --generation <n>` and `git merge`.
- nice -n 19 bunx vitest run packages/core/tests/src/lib/integration/land/land-bring-forward.helper.spec.ts passes.
- land-refresh-moved.e2e.spec.ts: through landPass, a head that moved a proposal from in-progress/ to review/ while the tip edited the in-progress/ copy is refreshed by the queue path (the edit carried, the in-progress/ copy removed, pushed without force) and the pushed head merges the tip cleanly.
- land-refresh-moved.e2e.spec.ts: the same spec: when the edit does not apply, the pull request gets exactly one comment naming `work enter --generation <n>` and `git merge` and nothing is pushed.
- nice -n 19 bunx vitest run plugins/integration/tests/src/lib/services/land-refresh-moved.e2e.spec.ts passes.
