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

Cause: the timeout under test is already an answer the runner gives, not a clock, so nothing waited; the time was the real git processes (fixture setup plus the claim's own, about a dozen) whose duration follows the CI machine's load: 65-79 ms locally, 174 and 288 ms in CI. A budget cannot describe that.

## non-goals

- The orphaned-work e2e spec, which overran tonight too and is not changed here.
- Any change to the product service: it already has the seam (the injected runner).

## slices

- global_gate: none

### S1 — Replace the git-backed unit with an in-memory runner
- **Status**: pending
- **Files**: `plugins/proposals/tests/src/lib/services/review-claim-timeout.e2e.spec.ts`, `plugins/proposals/tests/src/lib/services/review-claim-timeout.spec.ts`
- **Gate**: none

## acceptance

- The spec spawns no git process and runs in under 10 ms, five runs in a row.
- Both cases still pass: a claim commit reported timed out that landed is `claimed`; one that did not land is `failed`.
