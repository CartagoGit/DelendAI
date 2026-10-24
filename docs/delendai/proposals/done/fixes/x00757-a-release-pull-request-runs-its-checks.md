---
id: x00757
title: "A release pull request runs its checks"
kind: fix
status: done
type: proposal
track: hosts
date: 2026-09-29
priority: P0
related: [x00753]
last-transition-id: 787b1b3d-0b53-482a-bc66-d564e2d82d6e
last-correlation-id: 787b1b3d-0b53-482a-bc66-d564e2d82d6e
last-transition-from: review
shipped-in:
  - "b28c3883ac9e"
---

# x00757 — A release pull request runs its checks

## goal

The promotion into the release branch and the forward sync back have their
checks run without anyone approving them, like every queued candidate.

## why

On 2026-09-29 the owner opened the promotion of `develop` into `main`
(#641) to approve it, and found GitHub asking to approve its workflows
first. The pull request's head is `develop` itself. Each time the queue
landed a candidate, the merge commit was the forge bot's, and the forge
parks every run on a bot's commit as `action_required`: `release-pr-gate`,
`quality-gate`, `tier2` and `CodeQL` waited for a button after every merge.
The queue already releases parked runs, but only on the candidates it has
armed, and nobody arms a promotion: a person approves it.

## why this design

- `branchModelPulls` finds the promotion and the forward sync with
  `isBranchModelMove` (x00753), the one test the lint and the closer use.
  Every queue run releases their parked runs before anything else, and
  says which it could not release.
- Merging the promotion stays a person's decision (ADR 0020). Releasing a
  run only lets the checks report.

## non-goals

None.

## Slices

- global_gate: none

### S1 — The queue releases the branch model's parked runs

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/forge/keep-the-queue-moving.script.spec.ts`
- **Files**:
  - `tools/scripts/forge/keep-the-queue-moving.script.ts`
  - `tools/scripts/forge/keep-the-queue-moving.script.spec.ts`
- shipped-in: `b28c3883ac9e`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — S1 verified at b28c3883ac9e ("fix(forge): a release pull request runs its checks"). keep-the-queue-moving.script.spec.ts 22/22 covers armCandidates x00575/x00554-S1 and branchModelPulls finding the promotion and the forward sync.
- review-attribution: claude-opus-5-5 from Merge pull request #652 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00757-all-g1/a-release-runs-its-checks (refs/heads/delendai/wip/claude-opus-5-5/implement/x00757-all-g1/a-release-runs-its-checks) (b28c3883ac9e9b70579af386fb8507b26aea36b3), opened by minimax-m3

## dependency graph

None.

## acceptance

- The promotion (integration branch into release branch) and a forward sync
  (`delendai/pr/forward-sync-…` into the integration branch) are found;
  publications and other pull requests are not.
