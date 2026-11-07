---
id: x01019
title: "Vitest keeps modules between spec files in core, proposals and tools"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-03
last-transition-id: fde22016-a072-4a5f-a90a-29571204c8a2
last-correlation-id: fde22016-a072-4a5f-a90a-29571204c8a2
last-transition-from: review
last-transition-at: 2026-11-04T22:02:44.638Z
---

# x01019 — Vitest keeps modules between spec files in core, proposals and tools

## goal

The core, proposals and tools vitest projects run with isolate false so a worker evaluates the module graph once instead of once per spec file, and packages/cli stays isolated.

## why

Measured on a 30-spec sample across core, cli, proposals, tools and e2e at maxWorkers=2: isolate false took 24.9s to 18.4s and 152% CPU, with 744 MB peak RSS, and all 228 tests stayed green. pool threads took 23.8s (1.09 GB), vmThreads 28.1s (1.40 GB), threads without isolate 18.2s (1.08 GB), so isolate false on the default fork pool is the best fit. Vitest reported the cli graph was evaluated 9,759 times.

## non-goals

- Isolation stays on in packages/cli; no pool change; bun test is not adopted (coverage lacks branch data and many vi APIs).

## slices

- global_gate: none

### S1 — Share the module graph in core, proposals and tools
- **Status**: pending
- **Files**: `vitest.shared.ts`, `packages/core/vitest.config.ts`, `plugins/proposals/vitest.config.ts`, `tools/vitest.config.ts`
- **Gate**: none
- acceptance:
  - "The 30-spec sample passes 228 of 228 tests under the changed config and runs faster than before."
- shipped-in: `f4a8b291f6e0`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Stale due to post-shipped-in drift: the slice files changed after `f4a8b291f6e0` on develop (`da3d5a486`, `5f76c7077`). Rebase the slice and re-run the 30-spec evidence on current develop before approval.

## acceptance

- The 30-spec sample passes 228 of 228 tests under the changed config and runs faster than before.
