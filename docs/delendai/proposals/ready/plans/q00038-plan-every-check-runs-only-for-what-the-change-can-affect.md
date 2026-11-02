---
id: q00038
title: "Plan: every check runs only for what the change can affect"
kind: plan
status: ready
type: proposal
track: ci
date: 2026-11-02
---

# q00038 — Plan: every check runs only for what the change can affect

## goal

A pull request and a local proof run the tests, lints and types its change can affect, chosen by a dependency analysis that follows symbols and learns what each check reads, so nothing unchanged is checked again and nothing affected is missed.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — S1
- **Status**: pending
- **Files**: `tools/scripts/ci/affected-specs.service.ts`
- **Gate**: none

## acceptance

- TODO: observable acceptance criteria.
