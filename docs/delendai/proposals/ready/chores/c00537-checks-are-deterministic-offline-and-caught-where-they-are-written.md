---
id: c00537
title: "Checks are deterministic, offline and caught where they are written"
kind: chore
status: ready
type: proposal
track: general
date: 2026-11-08
---

# c00537 — Checks are deterministic, offline and caught where they are written

## goal

CI stops being red for reasons that are not the change: specs do not wait on real clocks, the PR run needs no network, and proposal hygiene is refused by the tools that write proposals instead of by CI.

## why

Nov 2-8 CI data: PR runs take 4 min (median), full runs 7. Merged PRs took 0.2 h open-to-merge at p50 and 19 h at p90, the tail being queue blocking. develop was red 81 of 141 h (57%), almost always a timing or concurrency spec (compute-slot x7, maintenance-lease race, reclaim-worktrees, record-buffer time window, concurrent work enter x01048) plus one CI config error (vitest groupOrder). lint-governance failed 23 PR runs, mostly proposal hygiene; one proof failed on bun audit because of the network. 55 specs use a real setTimeout or sleep without a fake clock, of 161 that use timers.

## non-goals

- The gate model (sectioned PRs and trains, full suite only at promotion, per-section health) is q00045 S7, owned by another agent. Do not touch tools/scripts/forge.
- Never fix a flaky spec by running it N times; every fix names the cause.

## slices

- global_gate: none

### S1 — A lint refuses real timers, sleeps and wall-clock waits in specs; fix the offenders
- **Status**: pending
- **Files**: `tools/scripts/lint/no-sleep-in-specs.script.ts`, `tools/scripts/lint/no-sleep-in-specs.constant.ts`, `tools/scripts/lint/no-sleep-in-specs.interface.ts`, `tools/scripts/lint/no-sleep-in-specs.script.spec.ts`, `tools/scripts/lint/no-sleep-in-specs.baseline.json`
- **Gate**: none
- acceptance:
  - "The lint refuses a spec that waits on a real timer or sleep unless it goes through @delendai/test-kit (useFakeClock and its peers) or a declared deterministic barrier"
  - "Specs that turned develop red are fixed first, each commit stating the cause"
  - "The baseline only shrinks"

### S2 — No network in prove or the PR run; network gates run at promotion and on a schedule
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `tools/scripts/lint/dependency-advisories.script.ts`, `package.json`
- **Gate**: none
- acceptance:
  - "bun audit and any other network gate do not run in prove or the PR run"
  - "They run at the develop to main promotion and on a schedule"

### S3 — Proposal-writing tools refuse what the governance and hygiene lints refuse
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/tools/authoring/create-proposal.tool.ts`
- **Gate**: none
- acceptance:
  - "Scaffold TODOs and the other hygiene findings are refused at write time, so they never reach CI"

### S4 — pr-ci-cost reports weekly develop red hours, PR open-to-merge p50/p90, runs per PR and top failure causes
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `tools/scripts/ci/pr-ci-cost.script.ts`, `tools/scripts/ci/pr-ci-cost.interface.ts`
- **Gate**: none
- acceptance:
  - "The report prints these numbers per week"

## acceptance

- The lint refuses a spec that waits on a real timer or sleep unless it goes through @delendai/test-kit (useFakeClock and its peers) or a declared deterministic barrier
- Specs that turned develop red are fixed first, each commit stating the cause
- The baseline only shrinks
- bun audit and any other network gate do not run in prove or the PR run
- They run at the develop to main promotion and on a schedule
- Scaffold TODOs and the other hygiene findings are refused at write time, so they never reach CI
- The report prints these numbers per week
