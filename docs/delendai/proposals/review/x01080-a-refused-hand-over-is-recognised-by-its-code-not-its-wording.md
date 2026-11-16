---
id: x01080
title: "A refused hand-over is recognised by its code, not its wording"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-16
last-transition-id: 283400b2-809e-4897-bf11-8c1861a2cb42
last-correlation-id: 283400b2-809e-4897-bf11-8c1861a2cb42
last-transition-from: in-progress
last-transition-at: 2026-11-16T08:56:52.338Z
---

# x01080 — A refused hand-over is recognised by its code, not its wording

## goal

A transition to review refused because the proposal already stands in review carries the code `already-in-review`, and `work deliver` republishes on that code alone. The text match on the refusal's wording is deleted.

## why

`packages/cli/src/lib/work-deliver.service.ts` decided that a hand-over was refused because the proposal was already in review by looking for the sentence `illegal transition: "review" → "review"` in the refusal. Rewording that message silently turned a harmless republish into a failed delivery. The transition refusal already has a `code` field in its output schema and `work deliver` already branches on the code `undelivered-slices`, so the same path carries this one.

Decisions (nothing is left undecided):
- The code is the string `already-in-review`, defined once in the proposals plugin contracts constants and sent in the top-level `code` and in `error.code` of the refusal when from and to are both review.
- The output schema already declares `code` as an optional string, so no schema, generated types or token dashboard change.
- `work deliver` reads the code (top level or in `error`) and has no fallback to the wording: the same text without the code is a plain refusal and does not republish.

## non-goals

- Giving other illegal-transition refusals a code.
- Changing the wording of the refusal.

## slices

- global_gate: none

### S1 — The same-status refusal carries a code and work deliver reads it
- **Status**: review
- **Files**: `plugins/proposals/src/lib/contracts/constants/transition-refusal-code.constant.ts`, `plugins/proposals/src/lib/tools/transition/dfa.tool.ts`, `plugins/proposals/tests/src/lib/tools/transition/dfa.tool.spec.ts`, `packages/cli/src/lib/work-deliver.service.ts`, `packages/cli/src/lib/work-deliver.service.spec.ts`
- **Gate**: none
- acceptance:
  - "`bunx vitest run plugins/proposals/tests/src/lib/tools/transition/dfa.tool.spec.ts` passes a case where validateTransition from review to review returns the code `already-in-review` in structuredContent and in its error."
  - "`bunx vitest run packages/cli/src/lib/work-deliver.service.spec.ts` passes a case that republishes on the code `already-in-review`."
  - "The same spec proves the refusal text `illegal transition: "review" → "review"` with no code does not republish and fails the delivery."
- shipped-in: `907ce2c2e992`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- `bunx vitest run plugins/proposals/tests/src/lib/tools/transition/dfa.tool.spec.ts` passes a case where validateTransition from review to review returns the code `already-in-review` in structuredContent and in its error.
- `bunx vitest run packages/cli/src/lib/work-deliver.service.spec.ts` passes a case that republishes on the code `already-in-review`.
- The same spec proves the refusal text `illegal transition: "review" → "review"` with no code does not republish and fails the delivery.
