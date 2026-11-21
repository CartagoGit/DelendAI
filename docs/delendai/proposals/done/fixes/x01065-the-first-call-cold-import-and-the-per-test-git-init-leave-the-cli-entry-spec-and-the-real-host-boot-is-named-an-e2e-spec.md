---
id: x01065
title: "The first-call cold import and the per-test git init leave the CLI entry spec, and the real host boot is named an e2e spec"
kind: fix
status: done
type: proposal
track: general
date: 2026-11-13
last-transition-id: 4be28205-b1c0-4291-950f-d0f7705e261d
last-correlation-id: 4be28205-b1c0-4291-950f-d0f7705e261d
last-transition-from: review
last-transition-at: 2026-11-21T00:14:08.397Z
shipped-in:
  - "2f99e2c40c63c6a1bec3004a405f905db917556f"
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
- **Status**: done
- **Files**: `packages/cli/src/index.e2e.spec.ts`, `tools/scripts/host/host-boot-journal.e2e.spec.ts`, `tools/scripts/lint/spec-git-init.baseline.json`, `tools/scripts/ci/spec-duration-budget.baseline.json`
- **Gate**: none
- shipped-in: `121532481c51`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: mai-code-2
- review-log: approved by mai-code-2 — verified at 2f99e2c40c63, validate exit 0 and tests 20/20 claimed, no recorded run cited; acceptance 3/3: (1) A module-scope beforeAll warms loadCommandsFor; the observed first CLI tests run in 9 ms and 2 ms, under their 30 ms budgets. Per-case repositories come from c… (2) The real host boot is tools/scripts/host/host-boot-journal.e2e.spec.ts; neither spec-git-init.baseline.json nor spec-duration-budget.baseline.json lists it, so… (3) The renamed host-boot and CLI entry files retain all 20 named cases, including the two real two-machine boot checks and every CLI entry assertion; all 20 pass. — Reviewed the delivered diff and current implementation; no later change touches these four files. Both E2E specs pass 20/20, the first CLI cases are 1-9 ms after the warm-up, the git-init lint passes with no entry beyond baseline, and the host boot keeps its real two-machine behavior under its E2E name.

## acceptance

- The CLI entry spec's first test runs in milliseconds and no case runs git init.
- The host boot spec lives in an e2e-named file and leaves both baselines.
- No test was removed.
