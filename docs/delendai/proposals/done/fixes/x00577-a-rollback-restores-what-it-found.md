---
id: x00577
title: "A rollback restores what it found"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-20
tags:
    - generated-artifacts
    - safety
shipped-in:
  - 60f8a60af
last-transition-id: df59f7c6-1d0a-4377-8cea-21abeb7a97ed
last-correlation-id: df59f7c6-1d0a-4377-8cea-21abeb7a97ed
last-transition-from: review
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

- **Status**: done
- **Files**: [`packages/cli/src/lib/generated-refresh.service.ts`, `packages/cli/src/lib/generated-refresh.service.spec.ts`]
- **Gate**: `npx vitest run packages/cli/src/lib/generated-refresh.service.spec.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Independence OK: implementer claude-opus-5 (60f8a60af), reviewer glm-5.3-max. Diff read: generated-refresh.service.ts rollback no longer runs `git checkout HEAD --` (which restored paths to the COMMIT and could destroy an unrelated local edit — the AGENT-BOOTSTRAP.md case the why documents); it restores the state it found. Spec covers the distinction: with a pre-existing local modification, the rollback preserves it instead of clobbering; gate generated-refresh.service.spec.ts green in the 63/63 combined run. Acceptance 'no automatic cleanup can cost work that was never published' is exactly what the new restore semantics guarantee.
- review-attribution: claude-opus-5 from commit 60f8a60afb09 names refs/heads/delendai/wip/claude-opus-5/x00577-S1-g1/a-rollback-restores-what-it-found (60f8a60afb0945f4217d4de73f1c719f79b05314), opened by glm-5.3-max
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
