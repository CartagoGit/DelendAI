---
id: x00753
title: "The queue keeps the branch model's own pull requests"
kind: fix
status: in-progress
type: proposal
track: hosts
date: 2026-09-29
priority: P0
related: [x00690]
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

- **Status**: in-progress
- **Gate**: `npx vitest run tools/scripts/forge/close-unpublished-prs.script.spec.ts tools/scripts/lint/pr-head-shape.script.spec.ts`
- **Files**:
  - `tools/scripts/lint/pr-head-shape.script.ts`
  - `tools/scripts/forge/close-unpublished-prs.script.ts`
  - `tools/scripts/forge/close-unpublished-prs.script.spec.ts`

## dependency graph

None.

## acceptance

- A pull request from the integration branch into the release branch, and
  one from a forward-sync ref into the integration branch, are kept open.
- A pull request from the integration branch into any other base is still
  closed.
