---
id: v00154
title: "the lints of a job run together and report every failure at once"
kind: perf
status: ready
type: proposal
track: ci
date: 2026-11-02
---

# v00154 — the lints of a job run together and report every failure at once

## goal

A lint job takes the time of its slowest lint, and one pass names everything wrong, so a change is not proved again for each failure in turn.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — S1
- **Status**: pending
- **Files**: `tools/scripts/lint/run-together.script.ts`
- **Gate**: none

## acceptance

- TODO: observable acceptance criteria.
