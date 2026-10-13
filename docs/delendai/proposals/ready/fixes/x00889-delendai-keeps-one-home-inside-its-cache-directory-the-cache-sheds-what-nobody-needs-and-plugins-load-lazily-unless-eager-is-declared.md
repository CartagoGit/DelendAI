---
id: x00889
title: "delendai keeps one home inside its cache directory, the cache sheds what nobody needs, and plugins load lazily unless eager is declared"
kind: fix
status: ready
type: proposal
track: general
date: 2026-10-13
---

# x00889 — delendai keeps one home inside its cache directory, the cache sheds what nobody needs, and plugins load lazily unless eager is declared

## goal

Nothing delendai writes lives outside the configured cache directory, a project upgraded from an older layout has it moved there once, the cache removes what its owners no longer need by default, and every plugin, the project's own included, is loaded on demand and released when idle unless the project declares eager loading.

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
