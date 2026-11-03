---
id: x01010
title: "The maintenance lease lives in the shared checkout, not in a worktree"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-03
---

# x01010 — The maintenance lease lives in the shared checkout, not in a worktree

## goal

A CLI process whose workspace is a unit worktree takes the maintenance lease under that worktree and recreates it after the worktree is removed, so work publish exits 4 with Directory not empty. Resolve the lease path against the shared checkout of the git common dir.

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
