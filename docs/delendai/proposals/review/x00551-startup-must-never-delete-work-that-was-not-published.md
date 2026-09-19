---
id: x00551
title: "Startup must never delete work that was not published"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-19
shipped-in:
    - 99be75d82910cb163df5469fd497a01a52da7aa1
tags:
    - git
    - startup
    - work-refs
    - data-loss
---

# x00551 — Startup must never delete work that was not published

## goal

Starting the server never destroys a unit of work. A work branch that
exists only on this machine survives every boot, and the work refs other
machines published are still observed.

## why

Measured on 2026-09-19 in this repository. Starting the MCP server deleted
a local, unpushed work branch carrying five commits
(`delendai/wip/claude-opus-5/x00550-S1-g1-state-writes-fail-loudly`). The
branch was gone, its worktree left with an unborn HEAD, and only the
reflog of the worktree made the tip recoverable.

The fetch phase builds one refspec per namespace and runs them together:

```
git fetch --prune origin \
  +refs/heads/develop:refs/remotes/origin/develop \
  +refs/heads/delendai/wip/*:refs/heads/delendai/wip/* \
  +refs/heads/delendai/pr/*:refs/remotes/origin/delendai/pr/*
```

The work namespace is mirrored onto LOCAL branches of the same name, and
`--prune` deletes every local ref in a mirrored namespace that the remote
does not have. A work branch that was never pushed is exactly that.

Work refs became visible branches under `refs/heads/` in x00546; the
mirroring refspec dates from when they were hidden under `refs/wip/`. The
combination is what makes it destructive — and it destroys the case
delendai exists to protect: work in progress that nobody published yet.

## non-goals

- **No loss of visibility.** The refs other machines published are still
  observed, classified and attributed exactly as before.
- **No change to deliberate deletion.** `lint:ref-lifecycle --reap` and
  `forge:publish` still remove refs; they do it with proof.

## slices

### S1 — A fetch may not delete a local branch

- **Status**: done — the work namespace is mirrored into remote-tracking
  refs in its own fetch (`+<ns>/*:refs/remotes/<remote>/<tail>/*`), so a
  prune can only ever remove the copy of a ref the remote dropped and can
  never reach a local branch. Observing work refs reads this machine's own
  branches and every remote's mirror, reporting each unit of work once
  under its logical name, and a work ref is resolved through its mirror
  when this machine has no branch for it — so attribution, rebuilds and
  the vanished-ref evidence all see what they saw before. Startup no
  longer fabricates local branches for other machines' work, which three
  existing specs pinned and now assert against the mirror. With the old
  refspec restored, the new spec fails: a local work branch is deleted.
- **Files**: [`packages/core/src/lib/startup-reconciler/git-seam.ts`, `packages/core/src/lib/startup-reconciler/work-ref-identity.ts`, `packages/core/tests/src/lib/startup-reconciler/unpublished-work.spec.ts`, `packages/core/tests/src/lib/startup-reconciler/fresh-machine.spec.ts`, `packages/core/tests/src/lib/startup-reconciler/ambiguous-conditions.spec.ts`, `packages/core/tests/src/lib/startup-reconciler/integration-evidence.spec.ts`]

- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler`

## acceptance

- Starting the server twice leaves an unpublished work branch untouched.
- A work ref published by another machine is still listed by the fetch
  phase, under its logical name.
- No refspec the startup runs can delete a ref under `refs/heads/`.
