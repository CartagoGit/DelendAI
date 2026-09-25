---
id: f00640
title: "Review debt is measured: age and drift since the work landed"
kind: feat
status: ready
type: proposal
track: governance
date: 2026-09-25
priority: P1
related:
    - x00637 # the certified integration branch the drift is measured on
---

# f00640 — Review debt is measured: age and drift since the work landed

## goal

For every proposal waiting in `review/`, the second agent can see how
old the review is and how far the repository has moved under it since
the work landed, and reviews come in the order that makes them
cheapest and most useful.

## why

An external audit on 2026-09-25 counted 118 proposals in review against
638 done, and named the risk: when the reviewer arrives, the context
that produced the change may be dozens or hundreds of merges gone. A
review of work that landed 250 commits ago, under files that changed
since, is a different job from one that landed twenty minutes ago — and
today both look the same in `proposal-ready-to-close`, which reports
only slices done and whether `shipped-in` is set.

## why this design

The facts are already in git: `shipped-in` names the merge commits, the
slices name their files, and the integration branch's history says what
happened since. Nothing needs a new store — the report derives them.

## non-goals

- Closing reviews automatically. Done stays a second agent's call.
- A semantic-conflict model. A measured, explainable proxy first.

## architecture

For each proposal in `review/`, from its `shipped-in` and slice Files:

- `reviewAgeDays`: since the latest `shipped-in` commit;
- `commitsSince`: commits on the integration branch after it;
- `filesTouchedSince`: the slice files changed since, by later commits;
- `driftRatio`: `filesTouchedSince / files`.

Reported by `proposal-ready-to-close` (review section) and sortable:
largest drift first by default, because those are the reviews that get
more expensive with every merge. A proposal without `shipped-in` is
reported as unmeasurable, never as fresh.

## Slices

- global_gate: none

### S1 — Measure review age and drift
- **Status**: in-progress
- **Gate**: `npx vitest run tools/scripts/lint/proposal-ready-to-close.script.spec.ts`
- **Files**: `tools/scripts/lint/proposal-ready-to-close.script.ts`, `tools/scripts/lint/proposal-ready-to-close.script.spec.ts`
The four measures for every review proposal, pure over git facts that
are injected in the spec; `--sort=drift|age` on the report.
Measured on develop at 309bbe59d: 79 proposals wait in review; the
oldest-landed carry 250+ commits since and every slice file touched.

### S2 — Surface it where reviewers look
- **Status**: pending
- **Gate**: `npx vitest run plugins/proposals/tests`
- **Files**: the proposals status/review tools — the literal list is recorded when the slice ships
The review queue the proposals tools return is ordered by drift, and
each entry carries its measures.

## acceptance

- Every proposal in review reports its age, commits since, files
  touched since and drift ratio, or says why it cannot be measured.
- A proposal whose files were rewritten after it landed sorts above
  one whose files are untouched.
