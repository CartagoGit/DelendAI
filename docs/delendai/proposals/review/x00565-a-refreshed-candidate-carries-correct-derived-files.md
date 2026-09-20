---
id: x00565
title: "A refreshed candidate carries correct derived files"
kind: fix
status: review
type: proposal
track: efficiency
date: 2026-09-20
tags:
    - ci
    - generated
    - automation
---

# x00565 — A refreshed candidate carries correct derived files

## goal

Bringing a candidate up to the integration branch leaves it green,
including the files no person writes. Nobody re-runs a generator by hand.

## why

Measured over one session in this repository: **six** candidates went red
on `catalog:check`, and the fix every single time was the same two
commands and a push.

The cause is a good decision meeting a bad case. `forge:refresh` merges
the integration branch into a candidate through a THROWAWAY INDEX — that
is what lets it refresh a queue without moving the shared checkout, and
it is right. But a textual merge is the correct answer for authored
files and the wrong one for derived files: the agent catalog is rendered
from the proposals on disk, so merging two versions of it produces a
file neither generator would ever produce, and the gate that checks the
artifact against its generator fails on the result.

x00559 fixed this for merges that happen in a working tree — a merge
driver regenerates, and a `post-merge` hook recomputes against the
finished tree. A candidate refreshed through a throwaway index never
touches a working tree, so neither runs.

The cost is not the red check. It is that the queue stops for a reason
nobody caused, and the only thing that restarts it is a person noticing
— which is the exact dependency this whole line of work exists to
remove.

## non-goals

- **No touching the shared checkout.** Each candidate is refreshed in
  its own throwaway worktree, which is removed whatever happens.
- **No resolving somebody's conflict.** A candidate that does not merge
  trivially is reported and left exactly as it was.
- **No force-pushing.** A push that the forge refuses is reported.

## slices

### S1 — Merge, regenerate, push — per candidate, in its own worktree

- **Status**: done — `forge:artifacts` finds the candidates the
  integration branch has moved past and, for each, merges in a throwaway
  worktree, runs the generators against the merged tree, commits only
  what they changed and pushes. A conflict, a failing generator or a
  refused push each leave the candidate untouched and say which.
- **Files**: `tools/scripts/git/refresh-candidate-artifacts.script.ts`,
  `tools/scripts/git/refresh-candidate-artifacts.constant.ts`,
  `tools/scripts/git/refresh-candidate-artifacts.interface.ts`,
  `tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`,
  `package.json`
- **Gate**: `npx vitest run tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`

### S2 — It runs on the same trigger as everything else

- **Status**: done — hung off the moment the integration branch moves
  here, beside the candidate refresh it completes.
- **Files**: `tools/scripts/git/hydrate-candidates-after-merge.script.ts`
- **Gate**: `npx vitest run --project tools`

## acceptance

- After the integration branch moves, a candidate that was behind is
  level with it AND its derived files match what the generators produce
  from the merged tree.
- A candidate that does not merge trivially is unchanged on the remote.
- The shared checkout's `HEAD` never moves, and no worktree is left
  behind, in any outcome.
