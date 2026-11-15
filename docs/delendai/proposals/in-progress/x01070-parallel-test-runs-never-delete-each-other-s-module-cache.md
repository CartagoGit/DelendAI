---
id: x01070
title: "Parallel test runs never delete each other's module cache"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-15
last-transition-id: f58455d7-68f3-4f7a-b9ab-e433bd023264
last-correlation-id: f58455d7-68f3-4f7a-b9ab-e433bd023264
last-transition-from: ready
last-transition-at: 2026-11-15T12:39:43.786Z
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

## acceptance

- The module cache path is node_modules/.vitest-cache/<16 hex of sha256(bun.lock)>, or no-lockfile when bun.lock is absent.
- The same lockfile gives the same key and a different one gives a different key (helper spec).
