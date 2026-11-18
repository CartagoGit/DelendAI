---
id: x01049
title: "The forge ruleset admits the train namespace"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-11-08
last-transition-id: 1b0b5202-2a22-4b51-bec4-859f9f81d3e8
last-correlation-id: 1b0b5202-2a22-4b51-bec4-859f9f81d3e8
last-transition-from: review
last-transition-at: 2026-11-18T04:48:09.353Z
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
- **Status**: in-progress
- **Files**: `tools/scripts/governance/forge-settings.lib.ts`, `tools/scripts/forge/train-assembly.ts`, `tools/scripts/forge/queue-order.ts`, `tools/scripts/forge/publication-prefixes.ts`
- **Gate**: none
- shipped-in: `9fd05bfa54c1`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Requesting a fresh submission bound to current HEAD: review has high drift (age and touched files), so prior evidence is no longer sufficient to approve safely.

### S2 — The pre-push guard admits the train namespace, from one source
- **Status**: in-progress
- **Files**: `packages/core/src/lib/development-policy/owned-ref-prefixes.ts`, `packages/core/src/lib/development-policy/git-guard-namespaces.ts`, `packages/core/src/cli.ts`, `tools/scripts/forge/publication-prefixes.ts`, `packages/core/tests/src/lib/development-policy/git-guard-namespaces.spec.ts`
- **Gate**: none

With the ruleset synced, the train push was still declined: the queue pushes through the installed pre-push hook, and the guard refused `delendai/train/…` as "outside the branches the shared-checkout-pr development profile uses". The guard's namespaces and the ruleset's were two copies of one fact. `ownedTrainPrefixes` now lives in core beside the work and publication prefixes; the guard's `policyNamespaces`, the forge ruleset and the queue's `trainPrefixesOf` all read it.
- shipped-in: `4092abaaa09f`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Requesting a fresh submission bound to current HEAD: review has high drift (age and touched files), so prior evidence is no longer sufficient to approve safely.

## acceptance

- The ruleset admits a train ref and a culprit ref under every owned namespace.
- A declined train push is reported with git's reason and nothing is dispatched.
- The pre-push guard admits a train ref and a culprit ref under every owned namespace, and still refuses a branch outside them.
