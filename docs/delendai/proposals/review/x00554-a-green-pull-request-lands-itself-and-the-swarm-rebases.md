---
id: x00554
title: "A green pull request lands itself and the swarm rebases"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-19
tags:
    - workflow
    - integration
    - hydration
    - swarm
last-transition-id: d1744948-b5c0-4105-a3ce-4946aad545c3
last-correlation-id: d1744948-b5c0-4105-a3ce-4946aad545c3
last-transition-from: in-progress
last-transition-at: 2026-10-11T00:02:44.016Z
shipped-in:
  - "dea43b3d7f38"
  - "581b5720bad3e883dc9fce2aa42553c0221d4289"
---

# x00554 — A green pull request lands itself and the swarm rebases

## goal

A pull request that passes its checks integrates on its own, the
integration node hydrates, and every work ref and publication ref that
was based on the old tip is re-based onto the new one — without anybody
watching, and without an agent discovering hours later that it built on
a base nobody else has.

## why

Observed on 2026-09-19 in this repository. `#276` passed every check and
then sat merged-but-unpropagated while `#277` and `#270` stayed behind
develop; `#270` (x00547 S3) has been green and unintegrated long enough
to be 33 commits behind, so its conflicts are now a task of their own.
Meanwhile every open work ref is still based on a tip that moved.

Two costs, both paid by every agent:

- **Work is done against a stale base.** A swarm's whole premise is that
  each agent starts from the same ground. When the ground moves and
  nothing re-bases, agents produce conflicting work and discover it at
  publication time, which is the most expensive moment.
- **Integration waits on a human.** The value of a green check is that
  it authorises the merge; requiring somebody to notice it throws that
  away and makes the rest of the swarm wait.

The machinery already exists and is unused for this: the WIP engine's
`rebaseWipOntoNewBase` replays a work ref onto a new base and reports
`RECOVERY_CONFLICT` instead of guessing, and the startup reconciler
already hydrates the checkout.

## non-goals

- **No merging of red or unreviewed work.** Auto-merge is conditioned on
  the checks the project declares required, not on "no failures yet".
- **No silent conflict resolution.** A ref that cannot be replayed keeps
  its old base and is reported; nothing is forced, nothing is dropped.
- **No forced strategy.** Projects that integrate locally (`shared-*`
  merge profiles) get the same cascade through their own integration
  path; the trigger is the policy's, not GitHub's.

## slices

### S1 — A green publication ref integrates without being asked

- **Status**: done
  anybody asking, and it is now armed **with the method the project
  declared**. That second half was missing and is the reason this slice
  says "honouring the policy's integration method": both arming sites
  passed a literal `--merge`. The literal is correct for this repository,
  which declares `merge`, which is exactly why it survived —
  `worktree-pr`, the profile recommended for a swarm, declares `squash`,
  so on such a project the queue either lands candidates a way nobody
  chose or the forge refuses the arming and the candidate sits unarmed
  with nothing to explain it. `declaredMergeMethod` and `mergeFlagFor`
  live in the one policy reader the scripts already share, so the queue
  and the forward-sync cannot disagree. Nothing merges that the policy
  would not have merged by hand: auto-merge still waits for the required
  checks, and this changes only HOW it lands, never WHETHER.
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler`
- **Files**: `tools/scripts/lib/declared-branches.ts`,
  `tools/scripts/forge/keep-the-queue-moving.script.ts`,
  `tools/scripts/forge/keep-the-queue-moving.script.spec.ts`,
  `tools/scripts/forge/forward-sync-release.script.ts`,
  `tools/scripts/forge/forward-sync-release.script.spec.ts`,
  `tools/scripts/forge/forward-sync-release.interface.ts`
- The forge seam enables the project's declared auto-merge for a
  publication ref once the required checks pass, honouring the policy's
  integration method. Nothing merges that the policy would not have
  merged by hand.
- shipped-in: `dea43b3d7f38`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.4
- review-log: approved by gpt-5.4 — verified at dea43b3d7f38, validate exit 0, tests 50/50 — Verified the merge-method plumbing now resolves the declared policy and both arming paths use the declared flag. Slice-scoped specs for declared-branches, keep-the-queue-moving and forward-sync-release passed 50/50.

### S2 — What depends on the integration branch follows it, and what somebody is working on is told

- **Status**: done
- shipped-in: `fd71074e1`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units`
- **Files**: `packages/core/src/lib/work-units/kept-unit-hydration.service.ts`, `tools/scripts/forge/refresh-candidates.script.ts`, `packages/core/src/lib/work-units/work-swarm-relations.service.ts`
- When the integration branch moves, every ref that nobody is working on
  follows it: a unit that holds no commits of its own is fast-forwarded
  (`kept-unit-hydration.service.ts`, and `work reap --apply` since
  x00878 S37), and each publication is refreshed by the queue and by the
  host when it hydrates (`refresh-candidates.script.ts`, `b0b2975d9`). A
  publication that cannot be refreshed is reported with its conflict and
  left as it was.
- A work ref somebody is working on is NOT replayed. This slice was
  written to replay each of them through `rebaseWipOntoNewBase`; that
  was decided against on 2026-10-11. Rewriting the branch under an agent
  in the middle of an edit moves files it has open and can leave its
  worktree in a conflict it did not start; it is told instead (S3), and
  the conflict, if there is one, is met once, by the agent, when it
  merges the integration branch before publishing.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.4
- review-log: approved by gpt-5.4 — verified at 581b5720bad3, validate exit 0, tests 36/36 — Verified kept units with no authored work fast-forward, candidate refresh respects the resolved publication namespace, and the queue no longer treats non-publication refs as its own. Slice-scoped checks passed 36/36.

### S3 — An agent is told its base moved under it

- **Status**: review
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/work-swarm-relations.spec.ts`
- **Files**: `packages/core/src/lib/work-units/work-swarm-relations.service.ts`, `packages/core/src/lib/contracts/interfaces/work-swarm.interface.ts`, `packages/core/tests/src/lib/work-units/work-swarm-relations.spec.ts`
- The boot and the work-status surface say, per work unit, whether it is
  based on the current integration tip, and what to run when it is not.
- Measured 2026-10-05 before writing it. Two of the three cases were
  already covered: a unit that holds nothing is fast-forwarded when it is
  entered again (`kept-unit-hydration.service.ts`), and a publication is
  refreshed by the queue. The third was not: a unit with commits of its
  own, whose base had moved, showed `+2/-5` in `work swarm` and nothing
  else, so its conflicts surfaced only when it published. `work swarm`
  (and its `relations` in `--json`) now lists it under "to sort out" as
  `behind`, with how far its base moved and what to run in its worktree,
  after every other kind, since it is the mildest.
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `581b5720bad3`

## acceptance

- A publication ref whose required checks pass integrates without anyone
  asking it to, by the method the policy declares.
- After the integration branch moves, every unit that holds nothing of
  its own and every publication follows it; a publication that cannot
  is reported with its conflict and left untouched. A work ref somebody
  is working on is not rewritten under them.
- An agent whose base moved is told so, with what to run.

