---
id: x00893
title: "work a git hook starts runs against the repository it names, not the hook's worktree"
kind: fix
status: ready
type: proposal
track: general
date: 2026-10-13
---

# x00893 — work a git hook starts runs against the repository it names, not the hook's worktree

## goal

Anything delendai starts from inside a git hook, the publication that follows a proposal leaving in-progress first, runs without the variables git exports to that hook, so it reads and writes the repository it was given instead of the worktree the hook ran in.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — TODO
- **Status**: pending
- **Files**: `TODO`
- **Gate**: none

## acceptance

- TODO: observable acceptance criteria.
