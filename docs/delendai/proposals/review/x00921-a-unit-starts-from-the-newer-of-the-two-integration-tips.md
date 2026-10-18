---
id: x00921
title: "A unit starts from the newer of the two integration tips"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-18
last-transition-id: 2525d717-81cd-4ed0-86ad-1c92af8a3e74
last-correlation-id: 2525d717-81cd-4ed0-86ad-1c92af8a3e74
last-transition-from: in-progress
last-transition-at: 2026-10-18T18:33:26.305Z
---

# x00921 — A unit starts from the newer of the two integration tips

## goal

`work enter` cuts a unit from the newest integration commit the clone knows: when the local integration branch is only behind its remote-tracking copy, the remote-tracking copy is the base.

## why

`integrationBase` (`packages/core/src/lib/work-units/work-unit-shared.service.ts`) answers with the local integration branch unless, under a pull-request model, the local branch carries commits the forge does not. A local branch that is merely behind the forge is answered too. Under `shared-checkout-pr` the shared checkout only follows the integration branch by fast-forward, which the host server does some time after a merge, so a unit entered in between starts behind: on 2026-10-18 x00919's and x00920's implement units were cut without their own just-merged proposal files (`find` found none) after `git fetch` had already brought them into `origin/develop`, and each had to be fast-forwarded by hand before the proposal could be moved to in progress.

## non-goals

- Changing which tip wins when the local branch holds commits the forge lacks.

## slices

- global_gate: type

### S1 — The newer tip is the base

- **Status**: review
- **Files**: `packages/core/src/lib/work-units/work-unit-shared.service.ts`, `packages/core/tests/src/lib/work-units/integration-base.spec.ts`
- **Gate**: type
- acceptance:
  - "When the local integration branch is an ancestor of its remote-tracking copy, `integrationBase` returns the remote-tracking commit, under every model; when the local branch holds commits the forge lacks, the answer is as before. A spec holds behind, ahead under a pull-request model, and ahead under a direct model."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `c561146179c2`

## acceptance

- A unit entered after a fetch, before the shared checkout fast-forwards, contains everything the forge's integration branch has.
