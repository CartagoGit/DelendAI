---
id: x01055
title: "File-granularity lock spec raced the mutex order and measured wall-clock time"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-08
last-transition-id: 391774d2-258a-4b9c-897c-c8738812f7d7
last-correlation-id: 391774d2-258a-4b9c-897c-c8738812f7d7
last-transition-from: ready
last-transition-at: 2026-11-08T21:24:24.723Z
---

# x01055 — File-granularity lock spec raced the mutex order and measured wall-clock time

## goal

The spec asserted elapsed wall-clock bounds and assumed the holder won the mutex before the second claim; under load both break. Make it order- and load-independent.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — TODO
- **Status**: pending
- **Files**: `TODO`
- **Gate**: none

## acceptance

- TODO: observable acceptance criteria.
