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

Reported by the owner on 2026-11-02: a project started with a profile that lands work through pull requests (or merges) could not make its first commit. Reproduced in a fresh `git init` folder with `shared-checkout-pr`: the pre-commit guard refused the first commit on `develop` as a direct commit to the integration branch. Nothing else can start such a project: a unit branches from the integration branch's commit, and a pull request needs a base on the forge, and an empty repository has neither. The same guard would then refuse the push that creates `develop` on the forge. On that founding commit the guard also printed that nothing commits in the shared checkout, which was false.

## non-goals

- Any direct commit or push to the integration branch once it has a commit, or once the forge has it.
- Branch protection on the forge, which the project's owner sets.

## slices

- global_gate: none

### S1 — The founding commit and its first push are allowed
- **Status**: pending
- **Files**: `packages/core/src/lib/development-policy/git-guard.ts`, `packages/core/src/lib/contracts/interfaces/git-guard.interface.ts`, `packages/cli/src/commands/guard.command.ts`, `packages/cli/src/contracts/interfaces/guard.interface.ts`, `packages/core/tests/src/lib/development-policy/git-guard.spec.ts`, `packages/cli/src/commands/guard.command.spec.ts`
- **Gate**: none
- acceptance:
  - "In a fresh repository under shared-checkout-pr, the first commit on the integration branch succeeds and the push that creates it on an empty forge succeeds; a second direct commit on it is refused as before. A spec covers each."

## acceptance

- In a fresh repository under shared-checkout-pr, the first commit on the integration branch succeeds and the push that creates it on an empty forge succeeds; a second direct commit on it is refused as before. A spec covers each.
