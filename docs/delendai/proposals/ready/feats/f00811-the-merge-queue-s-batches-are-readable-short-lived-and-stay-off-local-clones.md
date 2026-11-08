---
id: f00811
title: "The merge queue's batches are readable, short-lived and stay off local clones"
kind: feat
status: ready
type: proposal
track: general
date: 2026-11-08
---

# f00811 — The merge queue's batches are readable, short-lived and stay off local clones

## goal

A person reading branches, a local clone or `work status` sees only develop, main and real work. The merge queue's batches carry a readable name, live only while their run does, never reach a local clone, and `work status` says what is being built, what waits and what landed.

## why

The queue's train branches (`<ns>/train/<tip12>/<members>`) and culprit markers (`<ns>/train/culprit/<n>`) are machine refs that clutter the owner's clone and mean nothing to a person.

## non-goals

- Applying the live forge ruleset: the owner runs forge-governance.sh apply-ruleset.

## slices

- global_gate: none

### S1 — Readable, short-lived batches named from the one prefix source
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `packages/core/src/lib/development-policy/owned-ref-prefixes.ts`, `packages/core/src/cli.ts`, `packages/core/tests/src/lib/development-policy/git-guard-namespaces.spec.ts`, `tools/scripts/forge/queue-order.ts`, `tools/scripts/forge/queue-order.spec.ts`, `tools/scripts/forge/queue-acceptance.ts`, `tools/scripts/forge/queue-acceptance.spec.ts`, `tools/scripts/forge/keep-the-queue-moving.script.ts`, `tools/scripts/forge/train-rehearsal.script.ts`
- **Gate**: none
- acceptance:
  - "A batch is named <ns>/queue/batch-<members joined by +>, from ownedQueuePrefixes in core, which the guard, the ruleset and the lint read."
  - "A batch is deleted once its members land or are isolated; old train/ names are still read and pruned until none are left."

### S2 — Isolation is a label and a comment on the pull request, through the forge adapter
- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/interfaces/change-request-forge.interface.ts`, `packages/core/src/lib/work-units/queue-isolation.service.ts`, `packages/core/tests/src/lib/work-units/queue-isolation.service.spec.ts`, `plugins/github/src/lib/change-request.helper.ts`, `plugins/github/tests/change-request.spec.ts`
- **Gate**: none
- acceptance:
  - "The adapter labels a pull request with the head it was isolated at and comments the reason and the failed run; the label clears when the head moves."
  - "Existing train/culprit refs are converted and deleted by the queue."

### S3 — Queue refs stay off local clones
- **Status**: pending
- **Files**: `packages/core/src/lib/startup-reconciler/queue-refs-local.service.ts`, `packages/core/tests/src/lib/startup-reconciler/queue-refs-local.service.spec.ts`, `packages/core/src/lib/startup-reconciler/git-seam.ts`, `packages/core/src/lib/startup-reconciler/seams.interface.ts`, `packages/core/src/lib/startup-reconciler/phases/fetch-refs.ts`, `packages/core/src/lib/startup-reconciler/reconcile-startup.ts`, `packages/cli/src/commands/init/init.command.ts`
- **Gate**: none
- acceptance:
  - "init and startup add a negative fetch refspec for the queue namespace (git >= 2.29, else skip with a note) and delete existing remote-tracking queue and train refs."
  - "With a real repo, after a fetch no queue ref exists locally."

### S4 — work status says what is built, what waits and what landed
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `packages/core/src/lib/work-units/queue-standing.service.ts`, `packages/core/tests/src/lib/work-units/queue-standing.service.spec.ts`, `packages/core/src/lib/work-units/work-unit-status.service.ts`, `packages/state-telemetry/src/lib/status/contracts/interfaces/work-status.interface.ts`
- **Gate**: none
- acceptance:
  - "work status shows the batch under test, the waiting pull requests with their reason and what landed in the last hour, from one forge read."

## acceptance

- A batch is named <ns>/queue/batch-<members joined by +>, from ownedQueuePrefixes in core, which the guard, the ruleset and the lint read.
- A batch is deleted once its members land or are isolated; old train/ names are still read and pruned until none are left.
- The adapter labels a pull request with the head it was isolated at and comments the reason and the failed run; the label clears when the head moves.
- Existing train/culprit refs are converted and deleted by the queue.
- init and startup add a negative fetch refspec for the queue namespace (git >= 2.29, else skip with a note) and delete existing remote-tracking queue and train refs.
- With a real repo, after a fetch no queue ref exists locally.
- work status shows the batch under test, the waiting pull requests with their reason and what landed in the last hour, from one forge read.
