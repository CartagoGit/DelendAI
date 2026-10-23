---
id: f00764
title: "Joint audits: a plan settles every finding of the audits it contains"
kind: feat
status: review
type: proposal
track: architecture
date: 2026-10-18
last-transition-id: e286af88-40f9-4e1e-9051-b81db652ecf7
last-correlation-id: e286af88-40f9-4e1e-9051-b81db652ecf7
last-transition-from: in-progress
last-transition-at: 2026-10-23T07:26:56.786Z
---

# f00764 — Joint audits: a plan settles every finding of the audits it contains

## goal

Several audits of the same codebase, by different models or at different times, are brought together by one audit plan: it references them, contrasts their findings in one ledger, and names for each finding the proposal that settles it, the finding it duplicates, or why it is rejected. Delivering the plan settles every audit it contains, so no finding is left open in one audit while another claims it is done.

## why

The owner asked for it on 2026-10-18, watching a00095: a multi-model audit where each reviewer adds `seenBy` lines, discrepancies and new findings (G1–G41, D1–D17) to one document by hand, and a consensus table is filled at the end. Nothing in the product knows that structure. Earlier audits (a00049–a00094) are closed one by one, each with its own findings, and the same defect found by two of them is tracked twice or not at all; a finding is "done" only in prose. Plans already know children (`contains.proposals`, `plugins/proposals/src/lib/proposals/proposal-document.ts:76`) and refuse to close while one is open (`blocked-by.ts`), but a plan cannot contain audits, and an audit's findings are not a thing any gate reads.

## non-goals

- Deciding consensus thresholds for the owner: the plan declares its own (a00095 uses 8 of 10).
- Rewriting the audits already closed.

## slices

- global_gate: type

### S1 — An audit's findings are data

- **Status**: done
- **Files**: `plugins/proposals/src/lib/proposals/audit-findings.ts`, `plugins/proposals/src/lib/contracts/interfaces/audit-findings.interface.ts`, `plugins/proposals/tests/src/lib/proposals/audit-findings.spec.ts`
- **Gate**: type
- acceptance:
  - "An audit's findings are parsed from its document into records (id, title, classification, zone, evidence, `seenBy`), from the heading-and-field form a00095 uses, with a spec over a00095's own text; a finding without evidence is reported."
- shipped-in: `46f6dcaa22d4`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — A plan contains audits and keeps one ledger

- **Status**: done
- **Files**: `plugins/proposals/src/lib/proposals/proposal-document.ts`, `plugins/proposals/src/lib/swarm/plan-audits.service.ts`, `plugins/proposals/src/lib/swarm/plan-closure.engine.ts`, `plugins/proposals/src/lib/swarm/plan-closure-guard.ts`, `plugins/proposals/tests/src/lib/swarm/plan-audits.spec.ts`
- **Gate**: type
- acceptance:
  - "A plan's `contains.audits` lists audits; its ledger maps every finding of each to exactly one settlement: `settled-by: <proposal ids>`, `same-as: <audit>/<finding>`, or `rejected: <reason>`, with the agreement it reached (reviewers who confirmed it, reviewers who disputed it, the plan's threshold). The ledger is a `## Ledger` table in the plan's body, one row per finding: `| <audit>/<finding> | <settlement> | confirmed: …; disputed: …; threshold: N |`. `parseProposalDocument` now carries a plan's `contains` and `closureGate` into its frontmatter: before, a plan's closure saw no contained proposal, sub-plan or audit at all and could close with every child open."
  - "A finding of a contained audit that the ledger does not settle is listed as open, the way an open child is today."
- shipped-in: `46f6dcaa22d4`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — Delivering the plan settles its audits

- **Status**: done
- **Files**: `plugins/proposals/src/lib/swarm/plan-closure.types.ts`, `plugins/proposals/src/lib/tools/close-plan.tool.ts`, `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`, `tools/scripts/lint/proposal-audit-ledger.script.ts`, `tools/scripts/lint/proposal-audit-ledger.spec.ts`, `plugins/proposals/tests/src/lib/tools/close-plan.tool.spec.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "The plan closes only when every finding is settled and every `settled-by` proposal is done; closing it moves each contained audit to done with a link to the plan, and an audit inside a plan cannot be closed on its own."
  - "`lint:proposals` refuses a ledger that names a finding no contained audit has, or settles one finding twice."
- shipped-in: `aef912580176`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- a00095 can be run as such a plan: its reviewers' findings land in one ledger, each settled by a proposal, a duplicate or a reason, and the audit closes when the plan does.
