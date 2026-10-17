---
id: x00908
title: "Every publication gets its pull request, and every finished unit is published"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-16
last-transition-id: 0b1d9e99-b1eb-4b58-a317-12a6f4d8716e
last-correlation-id: 0b1d9e99-b1eb-4b58-a317-12a6f4d8716e
last-transition-from: in-progress
last-transition-at: 2026-10-16T18:16:44.737Z
shipped-in:
  - "07bedd840b7708026ca98792920319d49f1264d4"
---

# x00908 — Every publication gets its pull request, and every finished unit is published

## goal

A unit whose commit moves its proposal out of where it was (retired from `paused`, back to `ready`, closed) is published like one that leaves `in-progress`, and a publication always ends with a pull request, whatever version of the forge CLI the machine has.

## why

The owner, 2026-10-16: "veo que se quedan ramas colgadas todavía, eso es que no está funcionando todo fino". Retiring three paused proposals left:

- three units holding the retirement commit unpublished: the commit hook publishes only when a proposal leaves `in-progress`, and these left `paused`;
- once published by hand, one branch (f00544) with no pull request: `gh pr create` failed on this machine's `gh` 2.4, and the promised fallback — the owner machine's `open-publication-prs` — asked `gh pr list --json headRefOid`, a field that version does not have; the failed call read as "it already has one", so it skipped the branch in silence on every pass. The close gate's certification asked for the same field.

## non-goals

- Opening pull requests for anything but well-shaped publications.

## slices

- global_gate: type

### S1 — A move out of any folder publishes the unit

- **Status**: done
- **Files**:
  - `packages/core/src/lib/work-units/unit-leaves-progress.service.ts`
  - `packages/core/src/lib/work-units/publication-target.service.ts`
  - `packages/core/tests/src/lib/work-units/unit-leaves-progress.service.spec.ts`
- **Gate**: type
- acceptance:
  - A commit on a unit's branch that moves its proposal to another folder, except into `in-progress`, names the publication (as leaving `in-progress` did); a commit that does not move it names nothing.
- shipped-in: `10c9f871f1b3`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: qwen-3.8-flash
- review-log: approved by qwen-3.8-flash — verified at 07bedd840b77, validate exit 0, tests 3/3; acceptance 1/1: (1) 3 tests / 3 passed via `vitest run packages/core tests/src/lib/work-units/unit-leaves-progress.service.spec.ts`; tsc --noEmit exit 0 in packages/core. Code pat… — Type gate is a clean `tsc --noEmit` in packages/core (exit 0). Slice file spec = 3 passed / 0 failed. Verified against merged state 07bedd840; the delivery commit 10c9f871 adds a `left` predicate using proposalFileAt(HEAD~1)/proposalFileAt(HEAD) that requires the folder to differ (dirname(before) != dirname(after)) and the destination not be in-progress (proposalInProgress(HEAD)); a commit that does not move the proposal names nothing (returns undefined). The 3 tests cover a move out, a move into in-progress, and a no-move case exactly.

### S2 — The forge is asked through REST, the same on every CLI version

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-units/publication-pull-request.service.ts`
  - `packages/core/tests/src/lib/work-units/publication-pull-request.service.spec.ts`
  - `tools/scripts/forge/open-publication-prs.script.ts`
  - `plugins/proposals/src/lib/tools/close-slice-certification.ts`
  - `plugins/proposals/tests/src/lib/tools/close-slice-certification.spec.ts`
- **Gate**: type
- acceptance:
  - When `gh pr create` opens nothing, `work publish` opens the pull request through `gh api repos/{owner}/{repo}/pulls`, the repository read from the remote.
  - `open-publication-prs` and the close gate's certification read pull requests through the REST API; a read that fails is said ("left for the next pass"), never taken for "it has one".
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `10c9f871f1b3`

## acceptance

- After a proposal is retired from `paused`, its unit is published and its pull request open, with no hand step, on this machine's `gh`.
