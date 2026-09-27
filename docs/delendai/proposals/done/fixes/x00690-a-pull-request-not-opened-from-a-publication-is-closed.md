---
id: x00690
title: "A pull request not opened from a publication is closed"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [f00644, x00677]
last-transition-id: 20223827-d928-4dca-beaa-e105929e7db0
last-correlation-id: 20223827-d928-4dca-beaa-e105929e7db0
last-transition-from: in-progress
---

# x00690 — A pull request not opened from a publication is closed

## goal

An open pull request whose head is not a publication does not sit in the
repository red and stale. The queue closes it, says why, and says how to
publish. Its branch is never touched.

## why

#514 was opened by hand from MiniMax's work ref
`delendai/wip/minimax-3/review/f00553-review-g1/review`. `pr-head-shape`
failed it in CI, as designed. Nothing acted on that failure:

- the owner machine brings only publications forward;
- the queue arms only publications;
- the ref reaper touches only finished pull requests.

The pull request stayed open, red and conflicting, and the owner kept
finding it among the branches that "never get rehydrated".

## why this design

- **One judge.** The queue uses `prHeadProblem`, the check CI already
  runs. What CI fails is what the queue closes, and nothing else.
- **Close, never delete.** The branch may be the only copy of the work
  (x00687), so it is left as it is. The comment says what `work publish`
  does, which is the one way a pull request is opened.
- **Forks are not judged** by this repository's namespaces.

## non-goals

- Deciding what happens to the work on the branch. That is its author's
  to publish.

## architecture

- `tools/scripts/forge/close-unpublished-prs.script.ts`:
  `unpublishedPullRequests`, `closingComment`.
- `.github/workflows/keep-the-queue-moving.yml`: a step after the reap.

## Slices

- global_gate: none

### S1 — The queue closes unpublished pull requests

- **Status**: done (git log: 0bcc0b357 Merge pull request #531 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00690-all-g1/a-pull-request-not-opened-from-a-publication-is-closed)
- **Gate**: `npx vitest run tools/scripts/forge/close-unpublished-prs.script.spec.ts`
- **Files**:
  - `tools/scripts/forge/close-unpublished-prs.script.ts`
  - `tools/scripts/forge/close-unpublished-prs.script.spec.ts`
  - `.github/workflows/keep-the-queue-moving.yml`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- A pull request from a work ref, or from outside the namespaces, is
  selected. A publication and a fork are not.
- Run read-only against the live repository, it selects #514 and
  nothing else.
