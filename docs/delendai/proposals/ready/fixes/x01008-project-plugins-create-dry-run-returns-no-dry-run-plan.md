---
id: x01008
title: "project_plugins_create dry run returns no dry-run plan"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-03
---

# x01008 — project_plugins_create dry run returns no dry-run plan

## goal

A dryRun call to project_plugins_create writes nothing but returns a non-IDryRunResult payload, so the dry-run guard rejects it as a contract violation. Return the plan (wouldChange/risk) and declare it in the output schema.

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
