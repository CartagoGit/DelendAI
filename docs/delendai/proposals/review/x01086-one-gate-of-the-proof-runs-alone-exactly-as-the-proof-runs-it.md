---
id: x01086
title: "One gate of the proof runs alone, exactly as the proof runs it"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-16
last-transition-id: 87a48559-7c78-47f2-bc13-470641f7e1b0
last-correlation-id: 87a48559-7c78-47f2-bc13-470641f7e1b0
last-transition-from: in-progress
last-transition-at: 2026-11-16T18:42:31.353Z
---

# x01086 — One gate of the proof runs alone, exactly as the proof runs it

## goal

An agent can run any one gate of the proof locally, exactly as the proof runs it: `delendai work prove --only=<gate>[,<gate>]`. Every failed gate says the command that repeats it.

## why

Five deliveries failed in one day because workers ran their own approximation of changed-file coverage, saw it pass, and the proof then failed on the floor (branches 55% < 69%, 64% < 69%, 14 files under floor). The proof's real sequence is vitest with `--coverage` over the near specs, then `changed-file-coverage.script.ts --base=...`. A type error also surfaced only after minutes of other gates.

## non-goals

- Changing what any gate checks, or how a failing gate lets the independent cheap ones finish.
- Recording a partial run as a proof, or letting it satisfy `work deliver`.

## slices

- global_gate: none

### S1 — One gate of the proof runs alone, exactly as the proof runs it
- **Status**: pending
- **Files**: `tools/scripts/ci/prove-plan.script.ts`, `tools/scripts/ci/prove-plan.script.spec.ts`, `packages/core/src/lib/work-units/work-unit-prove-only.service.ts`, `packages/core/src/lib/work-units/work-unit-prove.service.ts`, `packages/core/src/lib/work-units/work-unit.service.ts`, `packages/core/tests/src/lib/work-units/work-unit-prove-only.service.spec.ts`, `packages/core/tests/src/lib/work-units/work-unit-prove-only.e2e.spec.ts`, `packages/cli/src/contracts/constants/work-command.constant.ts`, `packages/cli/src/lib/work-deliver.service.ts`, `packages/cli/src/lib/work-deliver.service.spec.ts`, `plugins/proposals/skills/delendai-work-unit-playbook/SKILL.md`
- **Gate**: none
- acceptance:
  - "prove-plan.script.spec.ts asserts that the changed-file-coverage gate is exactly the vitest --coverage step over the near specs followed by changed-file-coverage.script.ts --base=<base>, and that an unknown gate is listed against the gates the proof defines; run with: bunx vitest run tools/scripts/ci/prove-plan.script.spec.ts"
  - "work-unit-prove-only.service.spec.ts asserts that a passing partial run reports proved: false, an unknown gate exits 2, and a failed gate ends with 'partial: the unit is not proved'; work deliver refuses a partial proof (work-deliver.service.spec.ts)"
  - "a failed gate prints 'delendai work prove --only=<gate>' as its last why line; a lint-only partial run does not take the compute slot (takesComputeSlot is false for it)"
  - "the work-unit playbook skill has one paragraph naming --only, and the CLI usage names it; bun run gen:all and lint:cli:i18n pass"
- decisions:
  - "gate = the step label before ': ', slugged, so the proof's printed labels are the only list of names"
  - "the script takes the compute slot itself, only when a selected gate is heavy (coverage, tests, land rehearsal, test:sqlite); typecheck and the lints already wrap themselves in with-compute-lock"
  - "the proof already ran its seconds-long steps and the typecheck beside the static checks before any test; the order is unchanged"
- shipped-in: `525139a8e4b9`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — S1 evidence is stale: shipped-in is 525139a8e4b9, but multiple slice files changed afterward on develop (including prove-plan script/spec and work-deliver/work-command files). Please redeliver S1 on current HEAD with fresh shipped-in and refreshed scoped evidence before re-review.

## acceptance

- `delendai work prove --only=<gate>` runs exactly the named gates, as the proof runs them, and never proves the unit.
- A failed gate ends with the command that re-runs it alone.
