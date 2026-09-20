---
id: x00577
title: "A rollback restores what it found"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-20
tags:
    - generated-artifacts
    - safety
---

# x00577 — A rollback restores what it found

## goal

No automatic cleanup can cost work that was never published.

## why

x00570 fixed a real defect: the post-merge refresh staged regenerated
files, the policy refused the commit on the integration branch, and the
shared checkout was left dirty after every hydration. The fix was to undo
the staging on a refusal.

It undid too much. The rollback ran:

```ts
git(root, ['restore', '--staged', '--', ...changed]);
git(root, ['checkout', 'HEAD', '--', ...changed]);
```

`git checkout HEAD --` restores those paths to **the commit** — not to
the state they were found in. And one of the bounded paths is
`docs/delendai/AGENT-BOOTSTRAP.md`, which is **mostly written by hand**;
only its quantitative block is generated. So an agent with uncommitted
edits in it, on a hydration whose commit the policy refuses — which is
*every* hydration on the integration branch — would have had those edits
silently replaced by HEAD.

The test that shipped with it asserted the checkout ends clean. It set up
a checkout that was *already* clean, so it could not have seen this. A
cleanup that can cost unpublished work is the one thing this model must
never do, and it was three lines and one missing fixture away from doing
it.

## non-goals

- Leaving the checkout dirty. That invariant stands; this only changes
  what "put it back" means.
- Preserving changes outside the bounded generated paths. Those were
  never touched and still are not.

## architecture

Before any generator runs, the bounded paths are read as they are — the
file's **bytes**, deliberately, not a git reference, because the point is
to restore what was there including changes git has never seen — together
with whether the index had each one staged.

On a refused commit, exactly those paths are written back to exactly
those bytes, and the index is put back to what it said: a file somebody
had staged stays staged, and one they had not does not become so. A path
that did not exist before is removed again.

## slices

### S1 — the refresh restores the state it found, not the commit

- **Status**: review
- **Files**: [`packages/cli/src/lib/generated-refresh.service.ts`, `packages/cli/src/lib/generated-refresh.service.spec.ts`]
- **Gate**: `npx vitest run packages/cli/src/lib/generated-refresh.service.spec.ts`

## acceptance

- An uncommitted edit in a bounded path survives a refused refresh, byte
  for byte.
- An edit that was already staged is still staged afterwards.
- A clean checkout is still clean afterwards — the invariant x00570 was
  written for.
- The three new tests **fail against the previous implementation**, which
  is how we know they test the defect rather than the fix.

## risks and mitigations

- **A generated file stays stale on the integration branch.** It already
  did, since the commit was always refused there, and the candidate
  refresh regenerates it on the branch that can carry the commit.
- **The snapshot costs a read of each bounded path.** Three files, once
  per merge.
