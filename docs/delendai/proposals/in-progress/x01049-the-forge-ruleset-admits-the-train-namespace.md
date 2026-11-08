---
id: x01049
title: "The forge ruleset admits the train namespace"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-11-08
last-transition-id: be051b32-2a72-4c49-bcab-eab04ce7bc04
last-correlation-id: be051b32-2a72-4c49-bcab-eab04ce7bc04
last-transition-from: ready
last-transition-at: 2026-11-08T03:00:01.510Z
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
- **Status**: pending
- **Files**: `tools/scripts/governance/forge-settings.lib.ts`, `tools/scripts/forge/train-assembly.ts`, `tools/scripts/forge/queue-order.ts`, `tools/scripts/forge/publication-prefixes.ts`
- **Gate**: none

## acceptance

- The ruleset admits a train ref and a culprit ref under every owned namespace.
- A declined train push is reported with git's reason and nothing is dispatched.
