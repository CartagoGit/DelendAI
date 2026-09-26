---
id: x00667
title: "A pull request runs on the branch it merges into"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-26
priority: P0
related: [x00657, x00649]
last-transition-id: 89f2cbf0-4981-446b-a3bf-5e30f6bf0762
last-correlation-id: 89f2cbf0-4981-446b-a3bf-5e30f6bf0762
last-transition-from: in-progress
---

# x00667 — A pull request runs on the branch it merges into

## goal

A pull request's CI run checks the merge commit on a local branch named
after the branch it merges into. It is then the same tree, on the same
branch, as the run the merge triggers.

## why

A pull request's run checks out a detached merge commit. The run on the
integration branch after the merge checks that branch out by name. A
check that depends on the checked-out branch can therefore be green on
the pull request and red on the integration branch. #465 did exactly
that: its guard refused writes on a checkout sitting on `develop`, and it
turned develop red for five merges (fixed by x00657). The queue's repair
path (x00649) takes a candidate's green run as proof that landing it
keeps the integration branch green. That proof did not cover
branch-dependent checks. An external audit (2026-09-26) rated the gap P0.

## why this design

- **One step, in the shared setup action.** Every job that installs the
  repository goes through `.github/actions/setup-bun-repo`. After its
  checkout, a `pull_request` run does `git checkout -B <base_ref>` at
  the merge commit. Nothing is pushed.
- **No base resolution reads a local branch.** `candidate-delivers`
  gets `--base=<base sha>`. The vitest `--changed` selection diffs
  against the base sha. `publication-scope` uses `origin/<base>`.
  `mass-content-removal` skips `develop` itself. A local `develop` at
  the merge commit therefore changes nothing they compute.
- **Proof.** This pull request's own run uses the new step, because the
  composite action is resolved from the checkout. The integration branch
  is green, so a green run here shows the two runs agree.

## non-goals

- Jobs that check out without the shared action. They install nothing,
  so they run no branch-dependent product code.

## architecture

- `.github/actions/setup-bun-repo/action.yml`

## Slices

- global_gate: none

### S1 — The merge commit is checked out on the base branch's name

- **Status**: review
- **Gate**: `CI run of the pull request`
- **Files**:
  - `.github/actions/setup-bun-repo/action.yml`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- On a `pull_request` run, every job using the shared setup action has
  the merge commit checked out on a local branch named after the base
  branch.
- Push runs are unchanged.
- The pull request carrying this change is green on every required
  check.
