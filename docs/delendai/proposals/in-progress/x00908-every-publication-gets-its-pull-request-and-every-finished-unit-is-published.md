---
id: x00908
title: "Every publication gets its pull request, and every finished unit is published"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-16
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

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-units/unit-leaves-progress.service.ts`
  - `packages/core/src/lib/work-units/publication-target.service.ts`
  - `packages/core/tests/src/lib/work-units/unit-leaves-progress.service.spec.ts`
- **Gate**: type
- acceptance:
  - A commit on a unit's branch that moves its proposal to another folder, except into `in-progress`, names the publication (as leaving `in-progress` did); a commit that does not move it names nothing.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — The forge is asked through REST, the same on every CLI version

- **Status**: in-progress
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

## acceptance

- After a proposal is retired from `paused`, its unit is published and its pull request open, with no hand step, on this machine's `gh`.
