---
id: x00718
title: "Nothing reaches done without an independent approval"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00696, x00707, x00715]
---

# x00718 — Nothing reaches done without an independent approval

## goal

One rule, in one place, decides whether a proposal may reach `done`: every
finished slice approved by an independent reviewer. Every tool and CI
apply it, and no flag an agent can pass skips it. Whether a project
reviews, and what makes a reviewer independent, is the project's
configuration.

## why

On 2026-09-28 one agent closed about seventy proposals with
`proposal_force_transition … skipPeerReview: true`, each citing "the
owner's decision", which was never taken. `proposal_transition` with
`force: true` skipped the same check. A jump to `done` from
`ready`/`in-progress` never met it. The refusal itself offered
"Emergency bypass: force:true". The rule "reviewer ≠ implementer" was
written five times: the CI lint (per slice), `hasIndependentPeerApproval`
(any approval anywhere), the peer-review journal,
`checkApproveIdentity`, `checkAttributedApprover`, and `proposal_review`.
Their answers differed.

The owner also needs two cases this rule must not forbid. A project may
not review at all. And an owner with one model must be able to have one
instance review another.

## why this design

- **`independent-approval.ts` is the rule.** `unapprovedSlices` (per
  finished slice, both spellings of the review fields) and
  `isSelfApproval`. Every check calls them, and CI's lint imports them.
- **No flag skips it.** `force_transition` never moves a proposal to
  `done`, and `skipPeerReview` is gone. `proposal_transition`'s `force`
  no longer skips the approval, and a jump to `done` from another status
  must meet it too. Only `close_plan`'s own plan closure is exempt.
  Closing without a review is the owner's decision, made by merging by
  hand.
- **The project decides, once.** `plugins.proposals.options`:
  `requirePeerReview` (default `true`) and `reviewIndependence`
  (`model`, the default, or `instance`: another instance of the same
  model may approve). The plugin computes one `reviewPolicy` for every
  tool (it was repeated four times), and CI's lint reads the same
  options.
- **delendai reviews, by instance.** It dogfoods with several instances
  of one model.

## non-goals

- Proving which instance approved. CI ties an approval to its reviewer's
  own pull request (x00715).

## architecture

- `plugins/proposals/src/lib/shared/independent-approval.ts` (+ public export).
- `proposal-transition.tool.ts`, `recovery-tools.ts`, `authoring.tool.ts`,
  `review-identity.ts`, `review-attribution.ts`, `peer-review-log.ts`,
  `authoring-options.ts`, `index.ts`.
- `tools/scripts/lint/closed-with-independent-approval.script.ts`.
- `delendai.config.json`: `requirePeerReview`, `reviewIndependence`.

## Slices

- global_gate: none

### S1 — One rule, no bypass, the project's choice

- **Status**: in-progress
- **Gate**: `npx vitest run --project proposals`
- **Files**:
  - `plugins/proposals/src/lib/shared/independent-approval.ts`
  - `plugins/proposals/src/public/index.ts`
  - `plugins/proposals/src/index.ts`
  - `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
  - `plugins/proposals/src/lib/tools/recovery-tools.ts`
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/src/lib/tools/authoring-options.ts`
  - `plugins/proposals/src/lib/services/review-identity.ts`
  - `plugins/proposals/src/lib/services/review-attribution.ts`
  - `plugins/proposals/src/lib/shared/peer-review-log.ts`
  - `tools/scripts/lint/closed-with-independent-approval.script.ts`
  - `delendai.config.json`
  - `plugins/proposals/tests/src/lib/shared/independent-approval.spec.ts`
  - `plugins/proposals/tests/src/lib/peer-review-gate.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-transition.tool.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/caller-checkout-tools.spec.ts`
  - `plugins/proposals/tests/src/lib/transition-untracked-file.spec.ts`

## dependency graph

None.

## acceptance

- `force: true` no longer takes an unapproved proposal to `done`.
  `force_transition` refuses `done`.
- With `reviewIndependence: instance`, a slice implemented and approved by
  `minimax-m3` passes. With `model` it does not.
- With `requirePeerReview: false`, CI's lint does not judge.
