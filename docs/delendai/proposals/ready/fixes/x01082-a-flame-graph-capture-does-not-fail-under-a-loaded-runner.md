---
id: x01082
title: "A flame-graph capture does not fail under a loaded runner"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-16
---

# x01082 — A flame-graph capture does not fail under a loaded runner

## goal

A flame-graph capture reports why it failed and its unit spec no longer races a 20 s wall-clock deadline against a loaded shard.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — Injected exec seam, deadline reason, real-process spec in the e2e tier
- **Status**: pending
- **Files**: `plugins/perf/src/lib/profile/real-perf-profile-deps.ts`, `plugins/perf/src/lib/contracts/interfaces/perf.interface.ts`, `plugins/perf/tests/src/lib/profile/real-perf-profile-deps.spec.ts`, `plugins/perf/tests/src/lib/profile/real-perf-profile-deps-deadline.spec.ts`, `plugins/perf/tests/src/lib/profile/real-perf-profile-deps.e2e.spec.ts`
- **Gate**: type

## acceptance

- TODO: observable acceptance criteria.
