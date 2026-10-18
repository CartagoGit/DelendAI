---
id: f00764
title: "Joint audits: a plan settles every finding of the audits it contains"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-10-18
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

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/proposals/proposal-document.ts`
- **Gate**: type
- acceptance:
  - "An audit's findings are parsed from its document into records (id, title, classification, zone, evidence, `seenBy`), from the heading-and-field form a00095 uses, with a spec over a00095's own text; a finding without evidence is reported."

### S2 — A plan contains audits and keeps one ledger

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/proposals/proposal-document.ts`, `plugins/proposals/src/lib/proposals/blocked-by.ts`
- **Gate**: type
- acceptance:
  - "A plan's `contains.audits` lists audits; its ledger maps every finding of each to exactly one settlement: `settled-by: <proposal ids>`, `same-as: <audit>/<finding>`, or `rejected: <reason>`, with the agreement it reached (reviewers who confirmed it, reviewers who disputed it, the plan's threshold)."
  - "A finding of a contained audit that the ledger does not settle is listed as open, the way an open child is today."

### S3 — Delivering the plan settles its audits

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/swarm/plan-closure.types.ts`
- **Gate**: type
- acceptance:
  - "The plan closes only when every finding is settled and every `settled-by` proposal is done; closing it moves each contained audit to done with a link to the plan, and an audit inside a plan cannot be closed on its own."
  - "`lint:proposals` refuses a ledger that names a finding no contained audit has, or settles one finding twice."

## acceptance

- a00095 can be run as such a plan: its reviewers' findings land in one ledger, each settled by a proposal, a duplicate or a reason, and the audit closes when the plan does.
