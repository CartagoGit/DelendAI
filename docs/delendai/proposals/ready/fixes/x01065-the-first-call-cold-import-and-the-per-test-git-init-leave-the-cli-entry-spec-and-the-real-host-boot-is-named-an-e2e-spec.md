---
id: x01065
title: "The first-call cold import and the per-test git init leave the CLI entry spec, and the real host boot is named an e2e spec"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-13
---

# x01065 — The first-call cold import and the per-test git init leave the CLI entry spec, and the real host boot is named an e2e spec

## goal

packages/cli/src/index.spec.ts pays a 4.8 s cold command import inside its first test and runs git init per case; host-boot-journal boots the real host and belongs to the e2e tier.

## why

CI measured the CLI entry spec's first test at several seconds because the first call imports every command, and each case ran git init. Time that follows the runner's load fits no budget. The host boot spec starts the real host and two clones, so it is an end-to-end spec by nature.

## non-goals

- work-git-spawn-budget counts real git spawns, so it stays as it is.
- train-assembly, work-unit-proof, reclaim-worktrees, publish-candidate and branch-runtime specs exercise real git merges and worktrees; they measure 40 to 560 ms and are reported, not changed.
- Any change of product code.

## slices

- global_gate: none

### S1 — Warm the CLI entry import once, copy repository templates, name the host boot e2e
- **Status**: pending
- **Files**: `packages/cli/src/index.spec.ts`, `tools/scripts/host/host-boot-journal.e2e.spec.ts`, `tools/scripts/lint/spec-git-init.baseline.json`, `tools/scripts/ci/spec-duration-budget.baseline.json`
- **Gate**: none

## acceptance

- The CLI entry spec's first test runs in milliseconds and no case runs git init.
- The host boot spec lives in an e2e-named file and leaves both baselines.
- No test was removed.
