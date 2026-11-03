---
id: x01007
title: "Specs pass on a loaded machine"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-11-03
last-transition-id: e11ac77c-46d4-4845-8d29-359809d3090e
last-correlation-id: e11ac77c-46d4-4845-8d29-359809d3090e
last-transition-from: in-progress
last-transition-at: 2026-11-03T05:14:39.029Z
---

# x01007 — Specs pass on a loaded machine

## goal

Six specs failed in proofs on 2026-11-03 while the machine was loaded and passed alone. Each depended on a wall-clock deadline below what a loaded machine needs. Make them deterministic, keeping every assertion.

## why

Every PR pays for these specs in proof retries, and each passes alone, so the retry hides a real defect in the spec. Reproduced with 40 busy loops on 10 cores. Root causes:

- coordination-chaos "40 concurrent disjoint claims": the lock mutex gave up after 10 s with 40 claims queued, leaving 11 entries; the test never looked at the claim results, so a timeout read as a lost update.
- close-slice-gate "process vanished": the call's wait is a wall-clock deadline fixed before the first start; a loaded machine spent it on that start and the second look, which finds the process gone, never ran.
- guard "hand-made branch": about a dozen git commands each start a bun hook process, so a 60 s ceiling is not enough when the machine is loaded.
- full-pipeline e2e: the invoke carried `timeoutMs: 5_000`; a loaded machine took longer, the invoke returned without a decision (`reading 'decision'`).
- token-budget dashboard addendum: building the dashboard measures every preset and surface and took 124 s under load against a 120 s ceiling.
- 1000-calls latency: the secondary bound compared wall-clock p99, which counts every slice the scheduler gives to other processes; CPU time counts only the process's own work.

## non-goals

- Changing product code: no product race was found; each failure was a spec deadline.
- Dropping, skipping or loosening any assertion, or changing the bound's formula.
- Speeding the dashboard generator itself.

## slices

- global_gate: none

### S1 — Close gate and lock chaos specs wait on the work, not the clock
- **Status**: review
- **Files**: `plugins/proposals/tests/src/lib/tools/close-slice-gate.spec.ts`, `plugins/proposals/tests/src/lib/chaos/coordination-chaos.spec.ts`
- **Gate**: none
- shipped-in: `34c7e62db9e2`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — Process-spawning and measuring specs get ceilings a loaded machine fits under
- **Status**: review
- **Files**: `packages/cli/src/commands/guard.command.spec.ts`, `tools/scripts/report/token-budget-dashboard.spec.ts`, `tests/e2e/routing/full-pipeline.e2e.spec.ts`
- **Gate**: none
- shipped-in: `34c7e62db9e2`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S3 — Latency overhead is measured in CPU time
- **Status**: review
- **Files**: `plugins/usage-tracking/tests/e2e/1000-calls-latency.e2e.spec.ts`
- **Gate**: none
- shipped-in: `34c7e62db9e2`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- Each of the six specs passes with 40 busy loops running on a 10-core machine.
- The chaos spec now asserts that every claim succeeded before counting entries.
- The vanished-process spec asserts the finding names the gone process.
