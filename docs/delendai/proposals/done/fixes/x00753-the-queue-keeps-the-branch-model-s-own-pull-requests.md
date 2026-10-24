---
id: x00753
title: "The queue keeps the branch model's own pull requests"
kind: fix
status: done
type: proposal
track: hosts
date: 2026-09-29
priority: P0
related: [x00690]
last-transition-id: 60fc3cd6-c485-4037-84d7-8726aa935c27
last-correlation-id: 60fc3cd6-c485-4037-84d7-8726aa935c27
last-transition-from: review
shipped-in:
  - "8cc340e080076c551cf704f5da0305ec7451f6d7"
---

# x00753 — The queue keeps the branch model's own pull requests

## goal

The promotion of the integration branch into the release branch, and the
forward sync that carries the release branch back, stay open for their
checks and their human approval.

## why

On 2026-09-29 the owner asked to promote `develop` to `main`. The release
pull request (#641, `develop` → `main`) was closed by the queue within the
hour: "`develop` is outside `delendai/pr/`: a pull request is opened from a
publication ref". x00690 closes every pull request whose head is not a
publication, and `lint:pr-head-shape` fails it in CI. Neither knew the two
pull requests the branch model opens itself:

- the promotion, whose head is the integration branch itself;
- the forward sync (`forge:forward-sync`), whose head is
  `delendai/pr/forward-sync-<sha>`, under the publication prefix but not
  in the shape of a unit's publication.

No release could be opened, and the next forward sync would have been
closed the same way.

## why this design

- `isBranchModelMove(head, base, branches)` names the two: head is the
  integration branch and base the release branch, or base is the
  integration branch and head carries the forward sync's prefix.
  `prHeadProblem` takes the base and returns no problem for either, so the
  lint and the queue agree.
- The queue lists each pull request's base (`baseRefName`) to decide.

## non-goals

- Who approves a promotion. That stays a person (ADR 0020).

## architecture

- `tools/scripts/lint/pr-head-shape.script.ts`,
  `tools/scripts/forge/close-unpublished-prs.script.ts`.

## Slices

- global_gate: none

### S1 — A promotion and a forward sync are not closed

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/forge/close-unpublished-prs.script.spec.ts tools/scripts/lint/pr-head-shape.script.spec.ts`
- **Files**:
  - `tools/scripts/lint/pr-head-shape.script.ts`
  - `tools/scripts/forge/close-unpublished-prs.script.ts`
  - `tools/scripts/forge/close-unpublished-prs.script.spec.ts`
- shipped-in: `8cc340e08007`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: MiniMax-M3
- review-log: approved by MiniMax-M3 — close-unpublished-prs.script.spec.ts + pr-head-shape.script.spec.ts: 8/8 green. Acceptance test 'keeps the promotion into the release branch and the forward sync back' covers both pull-request shapes named in the proposal. Delivering commit 8cc340e08007 (+9/-3 in close-unpublished, +28 in pr-head-shape, +28 in close-unpublished spec).
- review-attribution: claude-opus-5-5 from Merge pull request #647 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00753-all-g1/a-release-promotion-stays-open (refs/heads/delendai/wip/claude-opus-5-5/implement/x00753-all-g1/a-release-promotion-stays-open) (8cc340e080076c551cf704f5da0305ec7451f6d7), opened by MiniMax-M3

## dependency graph

None.

## acceptance

- A pull request from the integration branch into the release branch, and
  one from a forward-sync ref into the integration branch, are kept open.
- A pull request from the integration branch into any other base is still
  closed.
