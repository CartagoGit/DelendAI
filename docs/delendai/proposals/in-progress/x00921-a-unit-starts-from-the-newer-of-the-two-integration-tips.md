---
id: x00921
title: "A unit starts from the newer of the two integration tips"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-18
last-transition-id: 1921c852-e423-4fb2-9d85-6903ae10bb8c
last-correlation-id: 1921c852-e423-4fb2-9d85-6903ae10bb8c
last-transition-from: ready
last-transition-at: 2026-10-18T17:36:25.370Z
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

- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-shared.service.ts`
- **Gate**: type
- acceptance:
  - "When the local integration branch is an ancestor of its remote-tracking copy, `integrationBase` returns the remote-tracking commit, under every model; when the local branch holds commits the forge lacks, the answer is as before. A spec holds behind, ahead under a pull-request model, and ahead under a direct model."

## acceptance

- A unit entered after a fetch, before the shared checkout fast-forwards, contains everything the forge's integration branch has.
