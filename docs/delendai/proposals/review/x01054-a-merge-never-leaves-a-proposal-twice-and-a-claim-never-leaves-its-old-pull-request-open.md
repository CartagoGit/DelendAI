---
id: x01054
title: "A merge never leaves a proposal twice, and a claim never leaves its old pull request open"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-08
last-transition-id: c97c6c88-f341-453f-8bcf-81008af9a668
last-correlation-id: c97c6c88-f341-453f-8bcf-81008af9a668
last-transition-from: in-progress
last-transition-at: 2026-11-10T02:14:21.142Z
---

# x01054 — A merge never leaves a proposal twice, and a claim never leaves its old pull request open

## goal

Two defects seen on 2026-11-08. (1) A merge train carried a create PR (ready/ copy) together with the slices that moved the proposal to review/, so develop held the same proposal id in two folders; the registry refused the duplicate and every transition failed until a hand fix. (2) work claim on an ended unit opens a new generation and a new PR but leaves the old PR open (#1858, #1859, #1860).

## why

Both defects were seen on 2026-11-08 and each stopped work until a person repaired it by hand.

- A merge train carried the create pull request of v00155 (the file in ready/perfs/) together with the slices that had moved it to review/. Git merges two paths without a conflict, so develop held the id in both folders, the registry refused the duplicate and every proposal transition failed.
- `delendai work claim --ref=<publication>` on an ended unit gives the claimant a new generation and, once published, a new pull request, and never looks at the publication it took over. It left #1858, #1859 and #1860 open beside the pull requests that replaced them.

## non-goals

- The stale copy is not picked by hand or by a second mover: the existing folder reconciler places the survivor.
- Pull requests are not closed by claim itself, only by the publish that makes the new one real.

## slices

- global_gate: none

### S1 — Merges keep one copy of each proposal id
- **Status**: review
- **Files**: `plugins/proposals/src/lib/proposals/reconcile-duplicate-ids.ts`, `plugins/proposals/src/lib/contracts/constants/status-progress.constant.ts`, `plugins/proposals/src/lib/contracts/interfaces/proposal-copy.interface.ts`, `plugins/proposals/tests/src/lib/proposals/reconcile-duplicate-ids.e2e.spec.ts`, `tools/scripts/proposals/reconcile-duplicate-ids.script.ts`, `tools/scripts/proposals/keep-one-proposal-copy.ts`, `tools/scripts/proposals/keep-one-proposal-copy.spec.ts`, `tools/scripts/forge/train-assembly.ts`, `tools/scripts/forge/train-assembly.spec.ts`, `tools/scripts/git/refresh-candidate-artifacts.constant.ts`, `tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`, `tools/scripts/test/test-time-budget.migration.json`
- **Gate**: type
- acceptance:
  - "root cause: two branches that move one proposal leave it at two paths; git merges them without a conflict and the registry refuses the duplicate id"
  - "the train and the candidate refresh (run as a refresh command; the post-merge hook runs the refresh) keep the copy with the latest last-transition-at, then the furthest status, and commit that as a derived fix"
  - "the survivor is placed by the existing folder reconciler, and a spec with two branches that move one proposal proves it"
- shipped-in: `3a7dfd098e7f`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — A claim retires the publication it superseded
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/superseded-publication.service.ts`, `packages/core/src/lib/contracts/interfaces/superseded-publication.interface.ts`, `packages/core/src/lib/work-units/work-unit.service.ts`, `packages/core/tests/src/lib/work-units/superseded-publication.service.e2e.spec.ts`
- **Gate**: type
- acceptance:
  - "root cause: claim adopted a publication and opened a new one, and nothing looked back at the old pull request"
  - "after the new publication is published the old one is retired with the reason superseded by #N, only when git merge-base --is-ancestor says the new publication contains the old tip"
  - "otherwise the old publication stays and the answer says why; both cases are specced"
- shipped-in: `fb53bd97e7ac`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- A merge of a create pull request and the slices that moved the proposal leaves one copy of its id, in the folder of its furthest status.
- A claimed publication is retired as superseded by the pull request that replaced it, and kept with a stated reason when that one lacks its tip.
