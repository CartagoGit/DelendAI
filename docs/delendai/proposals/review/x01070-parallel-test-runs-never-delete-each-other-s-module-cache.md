---
id: x01070
title: "Parallel test runs never delete each other's module cache"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-15
last-transition-id: 4c436911-ca67-4c8f-bada-822a1566d7bf
last-correlation-id: 4c436911-ca67-4c8f-bada-822a1566d7bf
last-transition-from: in-progress
last-transition-at: 2026-11-15T12:58:08.631Z
---

# x01070 — Parallel test runs never delete each other's module cache

## goal

Parallel vitest processes in one worktree never delete each other's module cache: the cache directory is keyed by the lockfile, so a lockfile change selects a new empty directory instead of clearing a shared one.

## why

vitest's fsModuleCache clears node_modules/.vitest-cache when the stored bun.lock hash differs. `prove` starts several vitest processes at once, so after any bun.lock change they remove the same tree concurrently and fail with ENOTEMPTY.

## non-goals

- Pruning old cache directories from test startup (concurrent pruning would bring the race back).

## slices

- global_gate: none

### S1 — Key the module cache directory by the lockfile
- **Status**: pending
- **Files**: `vitest.shared.ts`, `vitest.config.ts`, `tools/scripts/ci/vitest-cache-key.helper.ts`, `tools/scripts/ci/vitest-cache-key.helper.spec.ts`
- **Gate**: none
- shipped-in: `e63b5d239537`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Need empirical acceptance evidence in this review round (validate exit code, test pass/total, and shipped commit hash) so the slice can be approved under current review policy.

## acceptance

- The module cache path is node_modules/.vitest-cache/<16 hex of sha256(bun.lock)>, or no-lockfile when bun.lock is absent.
- The same lockfile gives the same key and a different one gives a different key (helper spec).
