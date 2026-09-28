---
id: x00743
title: "An owner authorizes a reconciliation"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-28
priority: P1
related: [x00696, x00715, x00741, x00742]
last-transition-id: fa7b8703-5a9c-4e3a-b157-567352eef300
last-correlation-id: fa7b8703-5a9c-4e3a-b157-567352eef300
last-transition-from: in-progress
---

# x00743 — An owner authorizes a reconciliation

## goal

When reviews went wrong and one agent has to carry other reviewers'
verdicts to the integration branch, it can, but only when the owner says
so, and only in a unit whose name says what it is doing.

## why

On 2026-09-28 a swarm reviewed 60 proposals in nine units and published
none. The verdicts were reconciled into one pull request (#611).
`closed-with-independent-approval` refused it, and it was right to: an
approval enters through its reviewer's own pull request, and an agent that
carries someone else's approvals looks exactly like one forging them.
Nothing let the owner say "this one is a reconciliation, let it through",
short of merging by hand past a red required check.

## why this design

- **A kind for the role.** `reconcile` joins the kinds of work. Its unit
  may change only documents and generated files, like a review
  (`DOCUMENT_ONLY_KINDS`). The name says what the pull request is.
- **The owner's word is a label.** A reconciliation's pull request lets in
  approvals that are not its author's only when it carries
  `delendai:owner-reconcile`, a label the owner applies on the forge. Every
  proposal it closes still needs an approval by someone other than its
  implementer. Without the label, the rule is as it was.
- **Read live.** The event payload is frozen at the push that started the
  run, and a re-run replays it. The lint reads the pull request's labels
  from the API with the job's own read token. The owner labels, re-runs
  the failed job, and it passes. No trigger was added: a `labeled` trigger
  would rerun the matrix for every label, and cancel the PR's current run.
- **Agents never apply it.** The reviewer procedure says so, and no
  delendai tool can add labels. Agents act with the owner's forge identity,
  so the label is a declared decision, not a secret. What it stops is an
  agent quietly carrying approvals, as happened on 2026-09-28.

## non-goals

- A credential only the owner holds. That would need a second forge
  identity for agents.

## architecture

- `packages/core/src/lib/development-policy/profiles.constant.ts`,
  `git-guard-review-scope.ts`; `work-units/work-unit-publish.service.ts`.
- `tools/scripts/lint/closed-with-independent-approval.script.ts`,
  `.github/workflows/ci.yml`.
- `plugins/proposals/src/lib/services/review-procedure.ts`.

## Slices

- global_gate: none

### S1 — The reconcile kind, and the owner's label

- **Status**: review
- **Gate**: `npx vitest run tools/scripts/lint/closed-with-independent-approval.script.spec.ts packages/core/tests/src/lib/development-policy/git-guard-review-scope.spec.ts`
- **Files**:
  - `packages/core/src/lib/development-policy/profiles.constant.ts`
  - `packages/core/src/lib/development-policy/git-guard-review-scope.ts`
  - `packages/core/src/lib/work-units/work-unit-publish.service.ts`
  - `packages/core/tests/src/lib/development-policy/git-guard-review-scope.spec.ts`
  - `tools/scripts/lint/closed-with-independent-approval.script.ts`
  - `tools/scripts/lint/closed-with-independent-approval.script.spec.ts`
  - `.github/workflows/ci.yml`
  - `plugins/proposals/src/lib/services/review-procedure.ts`

## dependency graph

None.

## acceptance

- On #611's content published as `…/reconcile/…`: without the label the
  lint refuses and names the label; with it, it passes, 60 proposals, each
  with an independent approval.
- The same label on a `review` branch changes nothing.
- A `reconcile` unit that commits a source file is refused, like a review.
