---
id: q00044
title: "Plan: a fault-injection harness proves the swarm survives its failures"
kind: plan
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-04
---

# q00044 — Plan: a fault-injection harness proves the swarm survives its failures

## goal

A harness injects the faults a swarm meets and proves the work is never lost: an agent killed mid-lease and restarted, network loss, concurrent commits, develop moving mid-run.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — The harness runs a scenario against a throwaway repository
- **Status**: pending
- **Files**: `tools/scripts/chaos/fault-harness.script.ts`
- **Gate**: none
- acceptance:
  - "A scenario file lists steps and faults; the harness runs it in a temporary repository with two units, then checks that no tip, lease or proposal is lost."

### S2 — Kill mid-lease and restart
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `tools/scripts/chaos/scenarios/kill-mid-lease.scenario.ts`
- **Gate**: none
- acceptance:
  - "An agent process killed while holding a lease is restarted; the lease is recovered or adopted and the unit publishes."

### S3 — Network loss
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `tools/scripts/chaos/scenarios/network-loss.scenario.ts`
- **Gate**: none
- acceptance:
  - "A push and a forge call fail mid-publish; a retry publishes once, with no duplicate pull request."

### S4 — Concurrent commits
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `tools/scripts/chaos/scenarios/concurrent-commits.scenario.ts`
- **Gate**: none
- acceptance:
  - "Two units commit to the same file at once; neither takes the other's hunk and none is lost."

### S5 — Develop moves mid-run
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `tools/scripts/chaos/scenarios/develop-moves.scenario.ts`
- **Gate**: none
- acceptance:
  - "develop advances during a proof; the candidate is brought forward and re-proved, never merged on a stale verdict."

## acceptance

- A scenario file lists steps and faults; the harness runs it in a temporary repository with two units, then checks that no tip, lease or proposal is lost.
- An agent process killed while holding a lease is restarted; the lease is recovered or adopted and the unit publishes.
- A push and a forge call fail mid-publish; a retry publishes once, with no duplicate pull request.
- Two units commit to the same file at once; neither takes the other's hunk and none is lost.
- develop advances during a proof; the candidate is brought forward and re-proved, never merged on a stale verdict.
