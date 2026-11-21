---
id: x01004
title: "A new project under a pull-request profile can make its first commit"
kind: fix
status: done
type: proposal
track: a00095-consistency
date: 2026-11-02
last-transition-id: db80b9b3-b1a0-492a-8d54-ca4b9d870567
last-correlation-id: db80b9b3-b1a0-492a-8d54-ca4b9d870567
last-transition-from: review
last-transition-at: 2026-11-18T02:57:56.098Z
paused-reason: "Paused 2026-11-04: temporary hop to repair canonical folder placement after force transition"
shipped-in:
  - "2791c0015b5ac861d8069184eb1804283448d1bc"
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
- **Status**: done
- **Files**: `packages/core/src/lib/development-policy/git-guard.ts`, `packages/core/src/lib/contracts/interfaces/git-guard.interface.ts`, `packages/cli/src/commands/guard.command.ts`, `packages/cli/src/contracts/interfaces/guard.interface.ts`, `packages/core/tests/src/lib/development-policy/git-guard.spec.ts`, `packages/cli/src/commands/guard.command.spec.ts`
- **Gate**: none
- acceptance:
  - "In a fresh repository under shared-checkout-pr, the first commit on the integration branch succeeds and the push that creates it on an empty forge succeeds; a second direct commit on it is refused as before. A spec covers each."
- shipped-in: `03de08ec0861`
- review-state: done
- review-implementer: gpt-5.3-codex
- review-reviewer: mai-code-2
- review-log: approved by mai-code-2 — verified at 2791c0015b5a, validate exit 0 and tests 78/78 claimed, no recorded run cited; acceptance 1/1: (1) git-guard.spec.ts asserts founding commit and creating push are allowed while subsequent direct commit/push are refused; guard.command.spec.ts covers hook extr… — Verified 2791c001 independently of implementer gpt-5.3-codex: the guard carries founding/creating facts from real git hooks, permits only the founding commit and the first protected-branch push, and still refuses the next direct commit/push. Both scoped guard specs passed.

## acceptance

- In a fresh repository under shared-checkout-pr, the first commit on the integration branch succeeds and the push that creates it on an empty forge succeeds; a second direct commit on it is refused as before. A spec covers each.
