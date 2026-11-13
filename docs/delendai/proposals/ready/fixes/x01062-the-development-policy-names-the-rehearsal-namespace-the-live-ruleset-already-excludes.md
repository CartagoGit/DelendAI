---
id: x01062
title: "The development policy names the rehearsal namespace the live ruleset already excludes"
kind: fix
status: ready
type: proposal
track: default
date: 2026-11-13
---

# x01062 — The development policy names the rehearsal namespace the live ruleset already excludes

## goal

The live forge ruleset excludes refs/heads/delendai/rehearsal/**/* but develop's policy does not name it, so every PR's ref-lifecycle (lint:namespace-ruleset) is red.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — Name the rehearsal namespace in the policy
- **Status**: pending
- **Files**: `packages/core/src/lib/integration/decisions/namespaces.helper.ts`, `packages/core/src/lib/ref-lifecycle/reconcile.service.ts`, `packages/core/src/lib/ref-lifecycle/reconcile.interface.ts`, `packages/core/src/cli.ts`
- **Gate**: none

## acceptance

- TODO: observable acceptance criteria.
