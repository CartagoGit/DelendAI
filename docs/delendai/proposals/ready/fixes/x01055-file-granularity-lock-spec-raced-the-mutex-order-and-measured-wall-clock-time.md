---
id: x01055
title: "File-granularity lock spec raced the mutex order and measured wall-clock time"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-08
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
