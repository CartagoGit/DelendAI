---
id: x01049
title: "The forge ruleset admits the train namespace"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-11-08
last-transition-id: 804d7f90-9dbd-4cbe-a00a-44aae3c0e156
last-correlation-id: 804d7f90-9dbd-4cbe-a00a-44aae3c0e156
last-transition-from: in-progress
last-transition-at: 2026-11-08T03:07:10.832Z
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

## acceptance

- The ruleset admits a train ref and a culprit ref under every owned namespace.
- A declined train push is reported with git's reason and nothing is dispatched.
