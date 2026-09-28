---
id: x00729
title: "An approval enters through a review"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00715, x00718, x00727]
last-transition-id: bf3e84dd-a1c2-41aa-bc45-e6869ba06f6d
last-correlation-id: bf3e84dd-a1c2-41aa-bc45-e6869ba06f6d
last-transition-from: review
shipped-in:
  - "2922577b4"
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

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/lint/closed-with-independent-approval.script.spec.ts`
- **Files**:
  - `tools/scripts/lint/closed-with-independent-approval.script.ts`
  - `tools/scripts/lint/closed-with-independent-approval.script.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 2922577b4 (x00729 S1, merge PR #594). fix(ci): an approval enters through a review. Una aprobación llega por la review (no se mete directamente a la proposal). 4/4 verde en independent-approval.spec.ts. claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5-5 from Merge pull request #594 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00729-S1-g1/an-approval-enters-through-a-review (refs/heads/delendai/wip/claude-opus-5-5/implement/x00729-S1-g1/an-approval-enters-through-a-review) (2922577b458a08a1f8b6c3ba55bc9bef69dfcd13), opened by minimax-m3

## dependency graph

None.

## acceptance

- `delendai/pr/minimax-m3/implement/x00001-S1-g1/t` adding
  `review-log: approved by minimax-m3` fails the lint.
- `delendai/pr/minimax-m3/review/batch-all-g1/r` adding the same passes it.
