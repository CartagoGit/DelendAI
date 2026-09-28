---
id: x00729
title: "An approval enters through a review"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00715, x00718, x00727]
last-transition-id: b6362647-745b-473e-8cf0-ce9fa64fdae6
last-correlation-id: b6362647-745b-473e-8cf0-ce9fa64fdae6
last-transition-from: in-progress
---

# x00729 — An approval enters through a review

## goal

An approval reaches the integration branch only through the pull request
of a review unit. The implementer's own pull request cannot carry one,
whatever names it writes.

## why

x00718 lets a project count another instance of the same model as an
independent reviewer (`reviewIndependence: instance`, delendai's own
setting). Under it, "reviewer ≠ implementer" cannot compare names, so an
implementer that wrote `review-log: approved by <its own model>` into its
own proposal passed every check: the tools could not tell the instances
apart, and CI's lint (x00715) only refused approvals by *another* name
than the pull request's agent.

## why this design

- CI's `closed-with-independent-approval` reads the kind of work the pull
  request's ref names (`delendai/pr/<agent>/<kind>/…`). A pull request of
  any kind but `review` that adds an approval fails, naming the approvals
  and `delendai review next`.
- A ref written before refs named their kind, or a person's own branch,
  is not judged by this rule.

## non-goals

- Proving which instance approved.

## architecture

- `tools/scripts/lint/closed-with-independent-approval.script.ts`
  (`kindOfRef`, `approvalsAdded`) and its spec.

## Slices

- global_gate: none

### S1 — Approvals come through review units

- **Status**: review
- **Gate**: `npx vitest run tools/scripts/lint/closed-with-independent-approval.script.spec.ts`
- **Files**:
  - `tools/scripts/lint/closed-with-independent-approval.script.ts`
  - `tools/scripts/lint/closed-with-independent-approval.script.spec.ts`

## dependency graph

None.

## acceptance

- `delendai/pr/minimax-m3/implement/x00001-S1-g1/t` adding
  `review-log: approved by minimax-m3` fails the lint.
- `delendai/pr/minimax-m3/review/batch-all-g1/r` adding the same passes it.
