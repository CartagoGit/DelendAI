---
id: x00691
title: "A finished work ref is not pushed back"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00687, x00690]
last-transition-id: c58b79a0-9f99-4a00-8dec-bb2588f83cb4
last-correlation-id: c58b79a0-9f99-4a00-8dec-bb2588f83cb4
last-transition-from: in-progress
---

# x00691 — A finished work ref is not pushed back

## goal

A work ref lives while its work is in progress: it keeps the work on the
remote, the pull request to the integration branch comes from its
publication, and it disappears when the work ends. The checkout
publisher never brings back a work ref whose work already reached the
remote under another ref.

## why

On 2026-09-27 MiniMax's work ref
`delendai/wip/minimax-3/review/f00553-review-g1/review` was deleted from
the forge. Its commits had been secured, and its worktree still existed
for a few seconds more. Minutes later the branch was back, at the same
commit, with MiniMax not running.

The commit-policy plugin's work-checkout publisher pushes, every
checkpoint interval, the branch of every worktree under the work-ref
prefix whose remote copy is missing or behind. It could not tell a work
ref never pushed from one removed because its work was finished. For
the owner that is the opposite of what a work ref is for: a branch that
should have ended reappears, unowned.

## why this design

- **Durability is the only reason to push.** A work ref is pushed so a
  dead session does not take its commits with it. When another remote
  ref already carries those commits, such as the integration branch or
  the unit's publication, there is nothing to make durable, and the
  push is skipped with the ref that carries them named.
- **Its own mirror does not count,** so ordinary progress (the work ref
  ahead of its own remote copy) is still pushed.

## non-goals

- Ending work refs whose agents stopped without publishing. That needs
  its own policy.

## architecture

- `plugins/commit-policy/src/lib/services/work-checkout-publisher.service.ts`:
  `publishHeld` skips a commit another remote-tracking ref contains.

## Slices

- global_gate: none

### S1 — Finished work is not pushed back

- **Status**: review
- **Gate**: `npx vitest run plugins/commit-policy/tests/src/lib/services/work-checkout-publisher.service.spec.ts`
- **Files**:
  - `plugins/commit-policy/src/lib/services/work-checkout-publisher.service.ts`
  - `plugins/commit-policy/tests/src/lib/services/work-checkout-publisher.service.spec.ts`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- A work checkout whose commits its publication already carries is
  skipped, naming the publication, and its work ref is not created on
  the remote.
- A work checkout with commits nothing else carries is still published,
  and stays level afterwards.
