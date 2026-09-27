---
id: x00678
title: "Another unit's refs do not block a pull request"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-27
priority: P0
related: [x00677, x00647]
---

# x00678 — Another unit's refs do not block a pull request

## goal

A pull request's `ref-lifecycle` run fails only over the pull request's
own ref. Every other unit's ref is reported. The integration branch's
runs, the schedule and a dispatch still fail over any ref in the
repository.

## why

`ref-lifecycle` judges every ref on the forge, and `delendai-validate`,
the only required check, needs it. On 2026-09-26 and 27, first nine
publication refs of one reviewer, then two, then twelve of another, had
no pull request. Each time, every other pull request went red on
`ref-lifecycle` and nothing could merge until somebody cleaned up after
that agent. A pull request is not the place where a stranger's ref is
settled, and its author cannot settle it.

## why this design

- **Judge the pull request on the pull request.** On a `pull_request`
  run, only a blocking verdict on the PR's own head fails the run. The
  others are printed with the note that they are judged on the
  integration branch.
- **The repository is still judged.** Push, schedule and dispatch runs
  keep failing over any blocking ref, so the integration branch's own
  certification still says when the forge carries work nobody owns.
- x00677 removes most of the cause: publications now open their own pull
  requests, and the hydrator opens the missing ones of well-shaped refs.

## non-goals

- Deleting or adopting anybody's refs.

## architecture

- `tools/scripts/lint/ref-lifecycle-guard.script.ts`: `failingFor`.

## Slices

- global_gate: none

### S1 — A pull request run fails only over its own ref

- **Status**: in-progress
- **Gate**: `npx vitest run tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`
- **Files**:
  - `tools/scripts/lint/ref-lifecycle-guard.script.ts`
  - `tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`

## dependency graph

None.

## acceptance

- On a pull request run, a blocking ref other than the head is reported
  and does not fail the run; the head's does.
- On push, schedule and dispatch runs, every blocking ref fails the run.
