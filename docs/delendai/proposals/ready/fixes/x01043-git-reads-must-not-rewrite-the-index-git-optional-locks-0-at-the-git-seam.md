---
id: x01043
title: "Git reads must not rewrite the index: GIT_OPTIONAL_LOCKS=0 at the git seam"
kind: fix
status: ready
type: proposal
track: ci
date: 2026-11-07
---

# x01043 — Git reads must not rewrite the index: GIT_OPTIONAL_LOCKS=0 at the git seam

## goal

Run every git read with GIT_OPTIONAL_LOCKS=0 (shared runners plus a process default), lint that no spawn drops it, and spec that status leaves the index mtime unchanged.

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
