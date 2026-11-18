---
id: x01079
title: "A proposal is ready only when nothing is left to work out"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-16
last-transition-id: ccc4746c-fce8-42f1-9085-1fcf24426148
last-correlation-id: ccc4746c-fce8-42f1-9085-1fcf24426148
last-transition-from: in-progress
last-transition-at: 2026-11-18T05:43:05.358Z
shipped-in:
  - "487204a6a172ae4646e635e3a6ee8ee17b49582d"
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
- **Status**: done
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
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: mai-code-2
- review-log: approved by mai-code-2 — verified at 487204a6a172, validate exit 0 and tests 39/39 claimed, no recorded run cited; acceptance 5/5: (1) Executed command: exit 0, 0 new findings across 94 open proposals; delivered package.json includes it in lint:job:governance. (2) Focused run with --project proposals passed this spec and all five rule groups. (3) Focused tools spec passed 6/6 baseline cases; implementation refuses fresh entries and update only shrinks. (4) Delivered transition-ready E2E passed 6/6, including named refusal, legal move and illegal transitions; no changedSince drift affected declared files. (5) Readiness parser/marker tests passed 6/6 and the delivered diff shares withoutNewMarker across readiness and review/completeness parsing. — Verified delivery 487204a6a172ae4646e635e3a6ee8ee17b49582d against every acceptance item and the proposal's non-goals. One pure readiness function is shared by lint and transition guard. Focused evidence: lint exits 0 (94 open proposals, 0 new findings), proposal specs 39/39 pass, including all five rules and transition E2E; the delivered diff wires shrink-only baseline behavior and the new: marker. No later commits touch slice files.

## acceptance

- `bun run lint:proposal-readiness` exits 0 and runs inside `lint:job:governance`.
- `vitest run plugins/proposals/tests/src/lib/proposals/proposal-readiness.spec.ts` covers each of the five rules with pure inputs.
- `vitest run tools/scripts/lint/proposal-readiness.spec.ts` covers the baseline that only shrinks.
- A transition to ready of a proposal with a finding is refused with the finding named; `plugins/proposals/tests/src/lib/e2e/proposal-transition.e2e.spec.ts` stays green.
- A Files entry written new:path is accepted before delivery, and review entry checks the path without the marker once delivered, shown by `plugins/proposals/tests/src/lib/services/proposal-completeness-new-marker.spec.ts`.
