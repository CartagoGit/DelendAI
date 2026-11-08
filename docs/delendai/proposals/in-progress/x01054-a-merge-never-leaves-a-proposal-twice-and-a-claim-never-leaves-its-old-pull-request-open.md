---
id: x01054
title: "A merge never leaves a proposal twice, and a claim never leaves its old pull request open"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-08
last-transition-id: 2fa3476b-07be-4d9b-a7ce-012554cedbfd
last-correlation-id: 2fa3476b-07be-4d9b-a7ce-012554cedbfd
last-transition-from: ready
last-transition-at: 2026-11-08T20:51:46.384Z
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
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/proposals/reconcile-duplicate-ids.ts`, `plugins/proposals/tests/src/lib/proposals/reconcile-duplicate-ids.spec.ts`, `tools/scripts/proposals/reconcile-duplicate-ids.script.ts`, `tools/scripts/proposals/keep-one-proposal-copy.ts`, `tools/scripts/forge/train-assembly.ts`, `tools/scripts/forge/train-assembly.spec.ts`, `tools/scripts/git/refresh-candidate-artifacts.script.ts`
- **Gate**: type
- acceptance:
  - "root cause: two branches that move one proposal leave it at two paths; git merges them without a conflict and the registry refuses the duplicate id"
  - "the train and the candidate refresh (which the post-merge hook runs) keep the copy with the latest last-transition-at, then the furthest status, and commit that as a derived fix"
  - "the survivor is placed by the existing folder reconciler, and a spec with two branches that move one proposal proves it"

### S2 — A claim retires the publication it superseded
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/superseded-publication.service.ts`, `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/tests/src/lib/work-units/superseded-publication.service.spec.ts`
- **Gate**: type
- acceptance:
  - "root cause: claim adopted a publication and opened a new one, and nothing looked back at the old pull request"
  - "after the new publication is published the old one is retired with the reason superseded by #N, only when git merge-base --is-ancestor says the new publication contains the old tip"
  - "otherwise the old publication stays and the answer says why; both cases are specced"

## acceptance

- A merge of a create pull request and the slices that moved the proposal leaves one copy of its id, in the folder of its furthest status.
- A claimed publication is retired as superseded by the pull request that replaced it, and kept with a stated reason when that one lacks its tip.
