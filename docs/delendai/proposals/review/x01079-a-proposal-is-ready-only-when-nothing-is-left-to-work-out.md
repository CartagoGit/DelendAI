---
id: x01079
title: "A proposal is ready only when nothing is left to work out"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-16
last-transition-id: 83097dc4-521e-421f-87d2-639287c79e1a
last-correlation-id: 83097dc4-521e-421f-87d2-639287c79e1a
last-transition-from: in-progress
last-transition-at: 2026-11-17T22:06:09.113Z
---

# x01079 — A proposal is ready only when nothing is left to work out

## goal

A proposal in ready or in-progress names real files, checkable acceptance and its decisions, and the move to ready refuses one that does not, by the same rules as a lint in CI.

## why

Slices reached work with guessed Files, acceptance nobody could run and decisions left to the implementer, so slices were split and Files corrected after delivery. Nothing checked these before work began.

## non-goals

- Judging whether Files is complete or whether acceptance truly proves the behaviour.
- Rewriting existing proposals: they are baselined and the baseline only shrinks.

## slices

- global_gate: none

### S1 — One readiness function, a lint and a transition guard
- **Status**: review
- **Files**: `plugins/proposals/src/lib/tools/transition/run-transition.tool.ts`, `plugins/proposals/src/lib/proposals/expand-declared-files.ts`, `plugins/proposals/src/lib/contracts/constants/create-proposal-schema.constant.ts`, `plugins/proposals/src/lib/tools/authoring/create-proposal-document.tool.ts`, `plugins/proposals/src/lib/resources/proposal-templates.resource.ts`, `package.json`, `new:plugins/proposals/tests/src/lib/proposals/proposal-readiness-reading.spec.ts`, `tools/scripts/migrate/rebrand-propagate.script.ts`, `new:plugins/proposals/tests/src/lib/e2e/proposal-transition-ready.e2e.spec.ts`, `new:plugins/proposals/src/lib/proposals/proposal-readiness.ts`, `new:plugins/proposals/src/lib/proposals/proposal-readiness-slices.ts`, `new:plugins/proposals/src/lib/services/ready-guard.service.ts`, `new:plugins/proposals/src/lib/contracts/interfaces/ready-guard.interface.ts`, `new:plugins/proposals/src/lib/contracts/constants/new-file-marker.constant.ts`, `new:plugins/proposals/src/lib/contracts/interfaces/proposal-readiness.interface.ts`, `plugins/proposals/src/lib/knowledge/proposal-workflow.ts`, `new:plugins/proposals/tests/src/lib/proposals/proposal-readiness.spec.ts`, `new:tools/scripts/lint/proposal-readiness.script.ts`, `new:tools/scripts/lint/proposal-readiness.spec.ts`, `new:tools/scripts/lint/proposal-readiness.baseline.json`
- **Gate**: type
- **Decisions**: Slices already delivered (review, done, retired) are not judged. The lint scans ready and in-progress, keys its baseline by proposal id, slice, rule and text, and its update flag only removes entries. The transition guard runs on every move to ready without force and also refuses a new: path that already exists; the lint accepts it, because a unit that carries its proposal and its code together has built the file. A new: path is stripped of its marker by the shared Files parser, so review entry checks the delivered path unchanged.
- acceptance:
  - "`bun run lint:proposal-readiness` exits 0 and runs inside `lint:job:governance`."
  - "`vitest run plugins/proposals/tests/src/lib/proposals/proposal-readiness.spec.ts` covers each of the five rules with pure inputs."
  - "`vitest run tools/scripts/lint/proposal-readiness.spec.ts` covers the baseline that only shrinks."
  - "A transition to ready of a proposal with a finding is refused with the finding named; `plugins/proposals/tests/src/lib/e2e/proposal-transition.e2e.spec.ts` stays green."
  - "A Files entry written new:path is accepted before delivery, and review entry checks the path without the marker once delivered, shown by `plugins/proposals/tests/src/lib/services/proposal-completeness-new-marker.spec.ts`."
- shipped-in: `f53099779c9c`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- `bun run lint:proposal-readiness` exits 0 and runs inside `lint:job:governance`.
- `vitest run plugins/proposals/tests/src/lib/proposals/proposal-readiness.spec.ts` covers each of the five rules with pure inputs.
- `vitest run tools/scripts/lint/proposal-readiness.spec.ts` covers the baseline that only shrinks.
- A transition to ready of a proposal with a finding is refused with the finding named; `plugins/proposals/tests/src/lib/e2e/proposal-transition.e2e.spec.ts` stays green.
- A Files entry written new:path is accepted before delivery, and review entry checks the path without the marker once delivered, shown by `plugins/proposals/tests/src/lib/services/proposal-completeness-new-marker.spec.ts`.
