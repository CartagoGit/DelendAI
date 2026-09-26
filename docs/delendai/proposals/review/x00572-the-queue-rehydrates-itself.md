---
id: x00572
title: "The queue rehydrates itself"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-20
tags:
    - ci
    - queue
    - automation
shipped-in:
  - 46d593142
---

# x00572 — The queue rehydrates itself

## goal

When the integration branch moves, every candidate that can be brought
forward is brought forward — by the forge, on the forge, without a
machine being switched on and without an agent deciding to.

## why

`keep-the-queue-moving` already runs at the right moments: on every push
to the integration branch, hourly, and on demand. It has
`contents: write` and `pull-requests: write`. And it **reports**.

A report is a request for somebody to do work. Which means the automation
that exists to stop the queue needing attention is itself a thing that
needs attention — and in practice the attention arrived from an agent
running the refresh by hand, four separate times in one session, because
that is what the report asked for.

The local `post-merge` hook does apply the refresh, but it only fires
when *this* checkout merges. Merges happen on the forge. So the only
thing standing between a moved integration branch and a stale queue was
whether a particular laptop happened to be running.

`--apply` was in this workflow once and was deliberately removed, for a
real reason: a candidate brought forward through a throwaway index
carried a **textual merge** of its derived files, which no generator
produces, so every refreshed candidate went red on `catalog:check` and
the refresh cost more than it saved.

Both halves of that are now fixed. x00565 gives the refresh a real
worktree and runs the real generators. x00569 removed the
repository-wide count that could not be correct on two candidates at
once. Applying is now worth more than reporting.

## non-goals

- Resolving conflicts. A candidate that does not merge trivially is left
  exactly as it was and reported, because resolving a conflict is a
  judgement about what the author meant.
- Force-pushing anything, ever.
- Merging candidates. Auto-merge already does that when a candidate is
  green; this is only about making sure it *can* go green.

## architecture

One step, after the report and before the reaper: `forge:refresh --apply`
brings each trivially-mergeable candidate forward, then
`forge:artifacts --apply` regenerates its derived files in a real
worktree with the real generators and pushes only what changed.

`if: always()`, for the same reason the reaper has it — a stuck queue is
exactly when this matters most. Neither command fails the job: the merge
that triggered the run has already happened, and a refresh that could not
run is not a reason to report the queue as broken.

Safety is by construction, not by supervision: conflicted candidates are
untouched, a failed generator pushes nothing, and no worktree is left
behind whatever happened.

## slices

### S1 — the workflow applies the refresh instead of asking for it

- **Status**: done
- **Files**: [`.github/workflows/keep-the-queue-moving.yml`]
- **Gate**: `bun run lint:lints-reach-ci`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Independence OK: implementer claude-opus-5 (46d593142, PR #307), reviewer glm-5.3-max. Judged on the DELIVERED state per procedure: the commit added one step after the report and before the reaper running `forge:refresh -- --apply` then `forge:artifacts -- --apply`, both `if: always()`, neither failing the job (verified in the workflow as of that commit, lines ~100-106: conflicted candidates untouched, failed generator pushes nothing). Gate lint:lints-reach-ci green (134/148, 14 baselined). NOTE for the record: a later proposal (fdcc2f416, x00628 2026-09-24) deliberately reverted the workflow to report-only, naming the owner machine as the one that brings candidates forward — that is a changedSince supersession, not a defect of this slice.
- review-attribution: claude-opus-5 from Merge pull request #307 from CartagoGit/delendai/pr/claude-opus-5/x00572-S1-g1/the-queue-rehydrates-itself (refs/heads/delendai/wip/claude-opus-5/x00572-S1-g1/the-queue-rehydrates-itself) (46d59314252242d1997aadc0bfe3d7fde0e0a35d), opened by glm-5.3-max
## acceptance

- A push to the integration branch brings every trivially-mergeable
  candidate forward and regenerates its derived files, with no local
  machine involved.
- A conflicted candidate is reported and its ref is unchanged on the
  forge.
- The reaper still runs when the refresh fails.

## risks and mitigations

- **A refresh pushes something wrong.** It pushes only a fast-forward
  merge of the integration branch plus what the generators changed, and
  never with `--force`. A candidate that cannot take the merge cleanly is
  skipped entirely.
- **CI cost.** Each refreshed candidate re-runs its checks — which is the
  point, since the previous run judged a tree that no longer exists.
  x00571 makes that run proportional to what the candidate touches.
