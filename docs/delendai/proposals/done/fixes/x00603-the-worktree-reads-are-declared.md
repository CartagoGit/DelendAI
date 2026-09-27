---
id: x00603
title: "The worktree reads are declared"
kind: fix
status: review
type: proposal
track: ci
date: 2026-09-22
tags:
    - ci
    - plugins
---

# x00603 — The worktree reads are declared

## goal

`develop` is green.

## why

x00601 taught `resolveHeadCommit` about worktrees: `.git` is a FILE
there, naming the real git directory, and the refs it points at live in
the **common** one. Three `readFileSync` calls followed.

`plugin-drift-budget` keeps sync I/O in plugin source deliberate by
naming every occurrence, keyed on the source line. The three new lines
were not in that list, and one existing entry stopped matching because
its line changed from `gitDir` to `commonDir`.

So the gate went red **on `develop`**, after the merge, rather than on
the change that caused it — and every open pull request inherited it.

## non-goals

- Relaxing the gate. It is right: a plugin reading the filesystem
  synchronously is a decision, and decisions get written down.

## architecture

The three lines join `SYNC_IO_ALLOWLIST`, next to the entries for the
same probe, with the reason: it reads git's plumbing directly rather
than spawning git, because it runs inside a reconcile that must not pay
a subprocess per call.

## slices

### S1 — the three reads are named

- **Status**: review
- **Files**: [`packages/core/tests/src/lib/plugin-drift-budget.spec.ts`]
- **Gate**: `npx vitest run packages/core/tests/src/lib/plugin-drift-budget.spec.ts`

## acceptance

- `0 sync node:fs calls in plugins/*/src outside the documented
  allowlist` passes on `develop`.
- The other two budgets in that spec are untouched and still pass.

## risks and mitigations

- **An allowlist that grows by habit.** Each entry is keyed on the exact
  source line, so a changed line stops matching and has to be looked at
  again — which is exactly how this one surfaced.

## notes

The gate caught the right thing and said so clearly; what it could not
do is catch it before the merge, because the pull request that added the
reads was measured against a `develop` that did not yet contain them.
