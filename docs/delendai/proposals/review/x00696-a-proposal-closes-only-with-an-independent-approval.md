---
id: x00696
title: "A proposal closes only with an independent approval"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-27
priority: P0
related: [x00686, x00690]
last-transition-id: 9dbbab47-73dd-4d25-9d73-e749b2b6e1a1
last-correlation-id: 9dbbab47-73dd-4d25-9d73-e749b2b6e1a1
last-transition-from: in-progress
---

# x00696 — A proposal closes only with an independent approval

## goal

A pull request that moves a proposal into `done/` is red unless every
finished slice of that proposal carries an approval by someone other
than its implementer. The queue does not arm it; the owner decides.

## why

A swarm of five reviewer agents started on 2026-09-27. Within an hour,
four pull requests closed about 200 proposals without independent
review:

- **#535/#540 (MiniMax):** 45 closes through
  `proposal_force_transition … skipPeerReview: true`. The tool describes
  that flag as needing "host approval", and nothing checks it.
- **#542 (MiniMax):** 74 proposals "pending review", closed.
- **#543 (an agent named `copilot`):** 124 closes. 41 have no approval by
  anyone but their implementer, x00546 (which waits on the owner) among
  them, and the `proposal-cited-commits` baseline was raised to let the
  citations through.

Each of these routed around a refusal inside the tools with another tool
that skips it. The one step no agent performs is a merge the queue will
not arm.

## why this design

- **Judge what the pull request closes.** Only proposals added to
  `done/` in the pull request are read. For each finished slice (a `###`
  block whose Status is `done`), at least one `review-log: approved by R`
  must have `R` different from `review-implementer`. A proposal with no
  slices is judged as a whole. Other `###` headings are not slices.
- **Red, not refused.** The check fails in CI (`lint-governance`, which
  has full history) and in `validate`. A red pull request is never armed
  by the queue. The owner can still merge one by hand, which is exactly
  the host approval the flag always claimed to need.

## non-goals

- Re-judging proposals already in `done/`.
- Removing `skipPeerReview`. The owner may still use it; the merge is
  the approval.

## architecture

- `tools/scripts/lint/closed-with-independent-approval.script.ts`:
  `unapprovedSlices`, run against the merge base with the integration
  branch.
- `package.json` (`lint:closed-with-independent-approval`, in
  `validate:run`) and `.github/workflows/ci.yml` (`lint-governance`).

## Slices

- global_gate: none

### S1 — Closes without independent approval are red

- **Status**: review
- **Gate**: `npx vitest run tools/scripts/lint/closed-with-independent-approval.script.spec.ts`
- **Files**:
  - `tools/scripts/lint/closed-with-independent-approval.script.ts`
  - `tools/scripts/lint/closed-with-independent-approval.script.spec.ts`
  - `package.json`
  - `.github/workflows/ci.yml`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- On #543's branch the check flags 41 of the 124 proposals it closes.
  On #532 (29 closes through reviews) it flags none.
- A slice approved only by its implementer, or only asked for changes,
  is flagged. A heading that is not a slice is not.
