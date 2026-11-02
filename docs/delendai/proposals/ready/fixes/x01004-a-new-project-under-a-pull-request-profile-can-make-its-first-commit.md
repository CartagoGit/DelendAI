---
id: x01004
title: "A new project under a pull-request profile can make its first commit"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-02
---

# x01004 — A new project under a pull-request profile can make its first commit

## goal

A project initialised with a profile that integrates through pull requests can be started: the founding commit on an integration branch with no commit yet, and the push that creates that branch on a forge that lacks it, are allowed; every other direct commit and push to it stays refused.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — The founding commit and its first push are allowed
- **Status**: pending
- **Files**: `packages/core/src/lib/development-policy/git-guard.ts`, `packages/core/src/lib/contracts/interfaces/git-guard.interface.ts`, `packages/cli/src/commands/guard.command.ts`
- **Gate**: none
- acceptance:
  - "In a fresh repository under shared-checkout-pr, the first commit on the integration branch succeeds and the push that creates it on an empty forge succeeds; a second direct commit on it is refused as before. A spec covers each."

## acceptance

- In a fresh repository under shared-checkout-pr, the first commit on the integration branch succeeds and the push that creates it on an empty forge succeeds; a second direct commit on it is refused as before. A spec covers each.
