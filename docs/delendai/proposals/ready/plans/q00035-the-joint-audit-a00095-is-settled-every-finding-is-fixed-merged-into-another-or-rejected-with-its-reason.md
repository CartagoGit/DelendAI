---
id: q00035
title: "The joint audit a00095 is settled: every finding is fixed, merged into another, or rejected with its reason"
kind: plan
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-24
---

# q00035 — The joint audit a00095 is settled: every finding is fixed, merged into another, or rejected with its reason

## goal

Every finding of the joint audit a00095, and every record of gpt-6.1-sol's contribution to it, is settled by a child proposal of this plan, by a proposal that already fixed it, as a duplicate of another finding, or rejected with its reason; the plan closes, and closes a00095 with it, when every settling proposal is done.

## why

a00095 is the multi-LLM joint audit of develop: 286 findings (145 G, 124 D, 14 C, 3 S headings) from twelve reviewers, plus 133 records in gpt-6.1-sol's contribution (docs/delendai/audit-reports/a00095/2026-10-19-gpt-6.1-sol/findings.jsonl), whose CONSENSUS-HANDOFF of 2026-10-22 recommends starting the causal union. The owner asked for a plan of dozens of proposals covering every finding, fix, improvement and refactor so the project becomes consistent. The 419 records were grouped by cause into 48 child proposals; the Ledger below settles each a00095 finding (the audit-ledger lint checks it), and each child's Why names the sol records it carries. While implementing x00939 the dishonest-outputSchema family (D4, D10, D18, D19, G71) was measured not to be a runtime defect since 48880ea1a, so those rows are rejected with the measurement and x00941 is retired.

## non-goals

- Rewriting a00095 or the reviewers' reports: they stay as published.
- Settling the sol records in this ledger: the ledger names a00095's own headings; the sol records are carried by the children's Why.

## slices

- global_gate: type

### S1 — Every child is done and the ledger is settled
- **Status**: pending
- **Files**: `docs/delendai/proposals/ready/plans/q00014-placeholder.md`
- **Gate**: none
- acceptance:
  - "proposals_close_plan reports no blocker: every contained proposal is done and every ledger row's settling proposal is done."
  - "Closing the plan moves a00095 to done."

## acceptance

- proposals_close_plan reports no blocker: every contained proposal is done and every ledger row's settling proposal is done.
- Closing the plan moves a00095 to done.
