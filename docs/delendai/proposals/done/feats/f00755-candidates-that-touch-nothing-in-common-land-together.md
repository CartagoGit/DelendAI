---
id: f00755
title: "Candidates that touch nothing in common land together"
kind: feat
status: done
type: proposal
track: efficiency
date: 2026-09-29
priority: P1
related: [x00556]
last-transition-id: 98932b13-680d-45ae-b760-6e37999f17f7
last-correlation-id: 98932b13-680d-45ae-b760-6e37999f17f7
last-transition-from: review
shipped-in:
  - "230e2af9c73b"
---

# f00755 — Candidates that touch nothing in common land together

## goal

Green candidates whose changes cannot affect each other land one after the
other without being brought forward and tested again; only a candidate
that the integration branch changed something under is.

## why

On 2026-09-29 four green pull requests took more than an hour to land.
The queue armed one candidate at a time, the head of the queue, and only
once it was level with the integration branch and the branch was
certified. After each merge every other candidate was behind; the owner
machine brought the head forward with a merge commit, its checks ran
again (about twenty minutes), then the next merge repeated it for the
rest. None of the four could affect another. The branch protection does
not require it (`develop` has `strict: false`); the queue did.

## why this design

- **Independence is measured, with the planner CI already trusts.** For a
  candidate that left the integration branch at `B`: its footprint is the
  test zones and files `B...candidate` changes, the integration branch's is
  what `B...tip` changes. The zones come from `reachableZones`, the same
  selection a pull request's checks run (x00556 S5), so "its checks stayed
  valid" means exactly "nothing that could change their result changed".
- **Accepted in queue order.** A candidate lands as it is when it is level,
  or when its footprint and the integration branch's share no zone and no
  file; and in both cases when it shares none with a candidate accepted
  before it, because they land on top of each other. A change that can
  reach every zone (root configuration, a workflow) is independent of
  nothing.
- **One decision, two users.** The queue job arms every accepted candidate
  and disarms the rest; the owner machine brings forward only the ones not
  accepted. Both read `queueAcceptance`.
- **A red integration branch still lands only its repair.** A pending one
  no longer blocks: every candidate that lands does so on checks that stay
  valid, and the integration branch still runs every check after each
  merge.

## non-goals

- Changing the branch protection (`strict` is already off on `develop`).

## Slices

- global_gate: none

### S1 — The queue lands every independent candidate

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/forge/independent-candidates.spec.ts`
- **Files**:
  - `tools/scripts/forge/independent-candidates.ts`
  - `tools/scripts/forge/independent-candidates.interface.ts`
  - `tools/scripts/forge/independent-candidates.spec.ts`
  - `tools/scripts/forge/candidate-footprint.ts`
  - `tools/scripts/forge/queue-acceptance.ts`
  - `tools/scripts/forge/keep-the-queue-moving.script.ts`
  - `tools/scripts/git/refresh-candidate-artifacts.script.ts`
  - `tools/scripts/ci/test-zones.script.ts`
- shipped-in: `230e2af9c73b`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — f00755 S1 delivered by claude-opus-5-5 (commit 230e2af9c73b). The slice makes the queue land every independent candidate: independence is measured via candidate footprint and zone overlap, candidates sharing no zone and no file with the integration branch's footprint AND with prior accepted candidates land together. The queue job arms every accepted candidate, the owner machine brings forward only the rest. 6/6 dedicated vitest tests pass. Slice was free (unclaimed); approved via implement worktree.
- review-attribution: claude-opus-5-5 from Merge pull request #651 from CartagoGit/delendai/pr/claude-opus-5-5/implement/f00755-S1-g1/independent-candidates-merge-together (refs/heads/delendai/wip/claude-opus-5-5/implement/f00755-S1-g1/independent-candidates-merge-together) (230e2af9c73b33d8beb77504e444dd538ad03bcf), opened by minimax-3
- review-reviewer: MiniMaxM3
- review-log: approved by MiniMaxM3 — f00755 S1 delivered at 230e2af9c73b (feat(forge): candidates that touch nothing in common land together): independent-candidates.ts + queue-acceptance.ts; the queue accepts candidates whose footprint and the integration branch share no zone and no file, and that share none with a candidate accepted before it. 6/6 tests green in independent-candidates.spec.ts.

## dependency graph

x00556 S5 (file-precise zones) → S1.

## acceptance

- Four candidates touching different zones and files are all accepted, a
  level one and three behind.
- A candidate the integration branch changed a zone of since it left is
  brought forward; so is one that overlaps an earlier accepted candidate,
  even when level; a change that can reach every zone lands alone.
- Against the open pull requests on 2026-09-29: #649 (level) lands, and
  #650 is brought forward because both move a proposal into review, which
  the `tools` and `proposals` zones list.
