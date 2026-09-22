---
id: x00601
title: "One act refreshes both projections"
kind: fix
status: review
type: proposal
track: architecture
date: 2026-09-22
tags:
    - proposals
    - sqlite
---

# x00601 — One act refreshes both projections

## goal

The SQLite projection is the one the runtime actually serves.

## why

There are two projections of the proposal markdown: the registry at
`<cacheDir>/proposals/index.json`, and `proposals.sqlite`. The reader
prefers SQLite and falls back to the registry whenever the two disagree.

Asked what it was actually serving, on this repository, before this
change:

```
entries: 971
stats:   {"reads":1,"fallbacks":1,"last":"fallback-divergence","lastDivergence":12}
notices: SQLite projection diverges from .cache/delendai/proposals/index.json;
         serving JSON instead (x00583, x00585, x00587, x00589, x00590,
         x00591, x00592, x00593, x00594, x00595, x00596, x00598)
```

Twelve proposals, every one of them written that day.

The reason is structural, not accidental. **Only one of the two was ever
refreshed.** `sync:proposals` runs from the pre-commit hook on every
commit that touches a proposal and rebuilds the registry. The database
was refreshed only by an MCP tool that nobody invokes by hand. So every
proposal written between one manual reconcile and the next made the
database staler, and the reader fell back.

Which means the shadow could never reach parity, the cutover it exists
to justify could never happen, and "prefer SQLite" was a preference that
had not applied once.

## non-goals

- Changing which source wins on divergence. The fallback stays; what
  changes is that it stops being the permanent state.
- The `sql` pinned mode, or the default. Untouched.

## architecture

`sync:proposals` reconciles the database from the same tree it just
built the registry from, in the same run. The markdown is the source;
the registry and the database are both views of it, taken at the same
moment, at the same commit.

**After the registry, not before.** If reconciling fails, the registry
is already written and the reader has something correct to fall back to
— which is exactly the behaviour this removes the *need* for without
removing the *ability*.

**A failure does not fail the commit.** A database that could not be
reconciled is a stale cache, not a lost proposal. Failing the commit
would trade a recoverable staleness for an unrecoverable interruption.

Measured: 1.7s for a dry run over 979 files; the hook step goes from
~2.8s to ~4.0s, on commits that touch a proposal.

### the run record could not name its commit, for the normal case

`resolveHeadCommit` reads git's plumbing directly and treats `.git` as a
directory. **In a worktree `.git` is a FILE** — `gitdir: …/.git/worktrees/x`
— so every read failed and it returned `workspace`.

Every agent works in a worktree; that is the whole point of the work-ref
model. So the projection was attributed to `workspace` rather than to a
commit in the ordinary case, and the run record could not say which
commit it described.

It resolves the pointer now, and reads refs from the **common** git
directory: HEAD is per-worktree, the refs it names are not. Reading both
from the same place found HEAD and then no ref, which is how it fell
through.

## slices

### S1 — the registry and the database are refreshed together

- **Status**: review
- **Files**: [`tools/scripts/proposals/reconcile-projection.ts`, `tools/scripts/proposals/reconcile-projection.spec.ts`, `tools/scripts/proposals/sync-proposal-registry.script.ts`]
- **Gate**: `npx vitest run tools/scripts/proposals/reconcile-projection.spec.ts`

### S2 — HEAD resolves from inside a worktree

- **Status**: review
- **Files**: [`plugins/proposals/src/lib/tools/db-reconcile.tool.ts`, `plugins/proposals/tests/src/lib/tools/db-reconcile.tool.spec.ts`]
- **Gate**: `bun test --timeout 30000 plugins/proposals/tests/src/lib/tools/db-reconcile.tool.spec.ts`

## acceptance

- After `sync:proposals`, the reader reports `sql-parity` with zero
  fallbacks and no notice. Verified live on this repository: the same
  probe that reported twelve divergences reports
  `{"reads":1,"fallbacks":0,"last":"sql-parity","lastDivergence":0}`.
- A reconcile that throws is reported and the registry still stands.
- `resolveHeadCommit` returns the real commit from inside a worktree,
  and still returns `workspace` for a directory that is not a checkout.
- `bun run test:sqlite`: 359 pass.

## risks and mitigations

- **The hook gets slower on proposal commits.** Measured at ~1.2s added.
  The alternative is a projection that is stale by construction, which
  costs a fallback on every read for the life of the repository.
- **Two writers racing on the database.** The reconciler already fences
  its promotion (r00055 S1) and refuses to overwrite an active database
  that moved while it worked; a losing run reports and the registry
  still stands.

## notes

This is the missing half of the story r00049 tells. Its own premise —
demote `docs/delendai/proposals/INDEX.json` from authority to derived
view — is already satisfied: **those three files no longer exist.** What
survived the deletion is the runtime registry, and the divergence that
mattered was between it and the database, refreshed by different acts at
different times.
