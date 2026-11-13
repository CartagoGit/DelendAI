---
id: x01063
title: "The review-claim timeout spec runs no git process, so its time is the same every run"
kind: fix
status: ready
type: proposal
track: default
date: 2026-11-13
---

# x01063 — The review-claim timeout spec runs no git process, so its time is the same every run

## goal

review-claim-timeout.e2e.spec.ts spawned about a dozen git processes per test, so CI measured 174 and 288 ms against a 65-79 ms local run and no budget described it; the timeout it tests is already an answer the runner gives, so the unit becomes an in-memory runner.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — Replace the git-backed unit with an in-memory runner
- **Status**: pending
- **Files**: `plugins/proposals/tests/src/lib/services/review-claim-timeout.e2e.spec.ts`, `plugins/proposals/tests/src/lib/services/review-claim-timeout.spec.ts`
- **Gate**: none

## acceptance

- TODO: observable acceptance criteria.
