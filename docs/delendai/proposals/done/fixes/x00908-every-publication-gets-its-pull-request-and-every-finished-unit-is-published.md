---
id: x00908
title: "Every publication gets its pull request, and every finished unit is published"
kind: fix
status: done
type: proposal
track: general
date: 2026-10-16
last-transition-id: 2913e514-55c1-463f-b79b-d0502228f5bc
last-correlation-id: 2913e514-55c1-463f-b79b-d0502228f5bc
last-transition-from: review
last-transition-at: 2026-10-17T08:51:16.047Z
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

- **Status**: done
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
- shipped-in: `10c9f871f1b3`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: qwen-3.8-flash
- review-log: approved by qwen-3.8-flash — verified at 07bedd840b77, validate exit 0, tests 22/22; acceptance 2/2: (1) publication-pull-request.service.ts calls ports.gh with the gh api -X POST repos/{owner}/{repo}/pulls endpoint (fallback branch when created === undefined or '… (2) close-slice-certification.ts swapped to gh api repos/{owner}/{repo}/pulls?state=all&per_page=N --jq '.[].head.sha' (no headRefOid); open-publication-prs.script… — Type gate: tsc --noEmit exit 0 on packages/core (delivery adds the REST fallback). Slice specs total 22 passed / 0 failed (publication-pull-request.service.spec.ts = 12, close-slice-certification.spec.ts = 10). git show 10c9f871 confirms publish falls back to gh api POST repos/{owner}/{repo}/pulls when gh pr create produced nothing, and open-publication-prs plus the close certification now read pulls through gh api ... --jq '.[].head.sha' with the no-PR case logged as 'left for the next pass' instead of treated as existing.

## acceptance

- After a proposal is retired from `paused`, its unit is published and its pull request open, with no hand step, on this machine's `gh`.
