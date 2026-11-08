---
id: x01049
title: "The forge ruleset admits the train namespace"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-11-08
last-transition-id: 056997d7-53da-4717-a97d-76942d9fca8c
last-correlation-id: 056997d7-53da-4717-a97d-76942d9fca8c
last-transition-from: review
last-transition-at: 2026-11-08T06:05:43.339Z
---

# x01049 — The forge ruleset admits the train namespace

## goal

The merge-train queue lands what it certifies: the branch-namespace ruleset allows the train refs the queue pushes, and a declined push is reported with its reason.

## why

The merge-train queue has never pushed a train: the branch-namespace ruleset does not exclude the train namespace, so the forge declines the push, run() swallows it, and the dispatch fails with HTTP 422 No ref found. Every queue run lands nothing.

## non-goals

- Applying the live ruleset: the owner runs the namespace-ruleset-guard sync.

## slices

- global_gate: none

### S1 — Allow the train namespace and report a declined push
- **Status**: review
- **Files**: `tools/scripts/governance/forge-settings.lib.ts`, `tools/scripts/forge/train-assembly.ts`, `tools/scripts/forge/queue-order.ts`, `tools/scripts/forge/publication-prefixes.ts`
- **Gate**: none
- shipped-in: `9fd05bfa54c1`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — The pre-push guard admits the train namespace, from one source
- **Status**: in-progress
- **Files**: `packages/core/src/lib/development-policy/owned-ref-prefixes.ts`, `packages/core/src/lib/development-policy/git-guard-namespaces.ts`, `packages/core/src/cli.ts`, `tools/scripts/forge/publication-prefixes.ts`, `packages/core/tests/src/lib/development-policy/git-guard-namespaces.spec.ts`
- **Gate**: none

With the ruleset synced, the train push was still declined: the queue pushes through the installed pre-push hook, and the guard refused `delendai/train/…` as "outside the branches the shared-checkout-pr development profile uses". The guard's namespaces and the ruleset's were two copies of one fact. `ownedTrainPrefixes` now lives in core beside the work and publication prefixes; the guard's `policyNamespaces`, the forge ruleset and the queue's `trainPrefixesOf` all read it.

## acceptance

- The ruleset admits a train ref and a culprit ref under every owned namespace.
- A declined train push is reported with git's reason and nothing is dispatched.
- The pre-push guard admits a train ref and a culprit ref under every owned namespace, and still refuses a branch outside them.
