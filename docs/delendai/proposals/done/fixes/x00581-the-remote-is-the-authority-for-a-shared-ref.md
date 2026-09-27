---
id: x00581
title: "The remote is the authority for a shared ref"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-20
tags:
    - work-refs
    - safety
---

# x00581 — The remote is the authority for a shared ref

## goal

No ref is judged, renamed or deleted on a reading the forge has already
moved past.

## why

`refsUnder` gathers local and remote refs by logical name and keeps the
**first** sha it sees. `for-each-ref` lists `refs/heads/` before
`refs/remotes/`, so the local copy always won — including when it was
behind.

A local copy is a cache of the last fetch. A shared ref is whatever the
forge says it is. Judging one by the other has two failure paths, and
both end in work nobody can reach:

- `isSpent` decides against the stale sha, concludes the work is already
  integrated, and **deletes a remote ref carrying commits the local copy
  never had**.
- `rename` publishes the stale commit under the new name, verifies *that*
  commit correctly — x00564 added exactly that proof — and then deletes
  the original, which held newer work. The proof was of the wrong thing:
  it confirmed the destination and never asked whether the source had
  moved.

Neither has been observed happening here; both are reachable by reading
the code, which is the point at which they should be closed.

## non-goals

- Fetching on every pass. The pass already runs after a fetch; this
  changes which of the two readings it believes.
- Blocking on a ref that has moved. It is simply not touched this time,
  and the next pass judges what is now there.

## architecture

`refsUnder` prefers the remote sha when the two disagree, with the
reasoning recorded where the next reader will look.

`reap` takes the sha the judgement was made against, and re-reads the
forge before deleting: if the ref has moved since, it deletes nothing and
answers false. `rename` passes the source sha through, so the original
name goes only when the forge still has it at the commit that was moved.

## slices

### S1 — a ref is deleted only at the commit it was judged at

- **Status**: review
- **Files**: [`tools/scripts/git/maintain-ref-namespace.script.ts`, `tools/scripts/git/maintain-ref-namespace.script.spec.ts`]
- **Gate**: `npx vitest run tools/scripts/git/maintain-ref-namespace.script.spec.ts`

## acceptance

- With a local branch behind its remote, `refsUnder` reports the remote
  sha.
- A reap asked for a commit the forge has moved past deletes nothing and
  answers false; the ref is still on the forge afterwards.
- Both tests **fail against the previous implementation**.

## risks and mitigations

- **A ref that keeps moving is never maintained.** It is also never lost,
  and a ref moving on every pass is live work, which this pass is not
  for.
