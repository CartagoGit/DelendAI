---
id: x00678
title: "Another unit's refs do not block a pull request"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P0
related: [x00677, x00647]
last-transition-id: c228cf31-1413-4b1a-a9e4-189477d7db8f
last-correlation-id: c228cf31-1413-4b1a-a9e4-189477d7db8f
last-transition-from: review
shipped-in:
  - "ae53a4a52"
---

# x00678 — Another unit's refs do not block a pull request

## goal

CI — a pull request's run and the integration branch's certification —
fails `ref-lifecycle` only over the pull request's own ref, and reports
every other unit's ref. The queue job judges the whole forge and fails
on any of it.

## why

`ref-lifecycle` judged every ref on the forge, and `delendai-validate`,
the only required check, needs it. On 2026-09-26 and 27 one reviewer's
nine publication refs with no pull request, then another's two, then its
twelve, turned every other pull request red. They also left develop
uncertified, and the queue arms only on a certified integration branch.
So nothing merged, not even the fixes, until somebody cleaned up after
that agent: three times in two days. A certification certifies a tree,
and another unit's ref is not part of it.

## why this design

- **CI judges its own tree.** On a pull request, a blocking verdict on
  the head fails the run; everything else is printed as reported. On
  the integration branch's own runs nothing fails for refs of other
  units.
- **The forge is still judged.** The queue job runs `ref-lifecycle
  --reap` with `REF_LIFECYCLE_SCOPE=repository` and fails over any
  blocking ref, so an orphaned publication is still reported, and
  reaped when it is a published copy.
- x00677 removes most of the cause: publications open their own pull
  requests, the hydrator opens the missing ones of well-shaped refs, and
  the guard is the integration branch's.

## non-goals

- Deleting or adopting anybody's refs.

## architecture

- `tools/scripts/lint/ref-lifecycle-guard.script.ts`: `failingFor`.

## Slices

- global_gate: none

### S1 — A pull request run fails only over its own ref

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`
- **Files**:
  - `tools/scripts/lint/ref-lifecycle-guard.script.ts`
  - `tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`
  - `.github/workflows/keep-the-queue-moving.yml`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé ae53a4a52 (x00678 S1, merge PR #513). fix(tools): CI certifies its own tree; the queue job judges the forge. ref-lifecycle-guard.script.ts: `failingFor(outstanding, reapable)` extrae el predicado; en un PR run (scope=head) solo el head bloquea; con REF_LIFECYCLE_SCOPE=repository (queue job) cada ref bloqueante falla. 26/26 verde en ref-lifecycle-guard.script.spec.ts. claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5-5 from Merge pull request #513 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00678-all-g1/another-units-refs-do-not-block-a-pull-request (refs/heads/delendai/wip/claude-opus-5-5/implement/x00678-all-g1/another-units-refs-do-not-block-a-pull-request) (ae53a4a52a57fd1ee2458cfb07112e1e65905c18), opened by minimax-m3

## dependency graph

None.

## acceptance

- On a pull request run, a blocking ref other than the head is reported
  and does not fail the run; the head's does.
- The integration branch's CI does not fail over another unit's ref.
- With `REF_LIFECYCLE_SCOPE=repository` (the queue job), every
  blocking ref fails the run.
