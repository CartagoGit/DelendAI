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

The live ruleset was applied from an unmerged branch (q00048 S2/S3) ahead of the policy, so develop's policy does not yet name the rehearsal namespace and the ruleset guard reports a disagreement on every pull request.

## non-goals

- The rehearsal plugin and its harness; only the namespace, its decisions and reconciler handling are brought in.

## slices

- global_gate: none

### S1 — Name the rehearsal namespace in the policy
- **Status**: pending
- **Files**: `packages/core/src/lib/integration/decisions/namespaces.helper.ts`, `packages/core/src/lib/ref-lifecycle/reconcile.service.ts`, `packages/core/src/lib/ref-lifecycle/reconcile.interface.ts`, `packages/core/src/cli.ts`
- **Gate**: none

## acceptance

- `bun run lint:namespace-ruleset` exits 0 against the live forge ruleset.
- The reconcile rehearsal spec passes and the rehearsal namespace is admitted and never reaped.
