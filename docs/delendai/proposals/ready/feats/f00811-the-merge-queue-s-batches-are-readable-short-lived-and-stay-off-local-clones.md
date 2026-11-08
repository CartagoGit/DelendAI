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

A person reading branches, a local clone or `work status` sees only develop, main and real work. The merge queue lands several ready candidates through ONE ordinary batch pull request, named for what it carries; the train refs, culprit markers, bisection and workflow dispatch it replaces are gone, queue refs never reach a local clone, and `work status` says what is being built, what waits and what landed.

## why

The queue's train branches (`<ns>/train/<tip12>/<members>`) and culprit markers (`<ns>/train/culprit/<n>`) are machine refs that clutter the owner's clone and mean nothing to a person, and the machinery behind them (assembly refs, dispatch, bisection, grace and fallbacks) is a second CI path beside the pull request one.

## non-goals

- Applying the live forge ruleset: the owner runs forge-governance.sh apply-ruleset.

## slices

- global_gate: none

### S1 — One batch pull request lands the ready candidates
- **Status**: pending
- **Files**: `packages/core/src/lib/development-policy/owned-ref-prefixes.ts`, `packages/core/src/cli.ts`, `packages/core/tests/src/lib/development-policy/git-guard-namespaces.spec.ts`, `tools/scripts/forge/batch-pull-request.ts`, `tools/scripts/forge/batch-pull-request.spec.ts`, `tools/scripts/forge/train-assembly.ts`, `tools/scripts/forge/train-assembly.spec.ts`, `tools/scripts/forge/keep-the-queue-moving.script.ts`, `tools/scripts/forge/publication-prefixes.ts`
- **Gate**: none
- acceptance:
  - "With two or more candidates ready the queue opens one pull request into develop from <ns>/queue/batch-<a>+<b>+<c>, built from develop with the members merged, derived files regenerated once, and its body listing the members."
  - "Green: the queue merges the batch pull request with the policy's merge method and closes each member as landed by it (or finds it merged by the forge); red: the batch is closed naming the failing jobs and the members land one by one."
  - "A lone candidate lands on its own pull request; no workflow dispatch, no train ref, no culprit marker."

### S2 — Remove the train machinery the batch pull request replaces
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `tools/scripts/forge/queue-order.ts`, `tools/scripts/forge/queue-order.spec.ts`, `tools/scripts/forge/queue-order.interface.ts`, `tools/scripts/forge/queue-acceptance.ts`, `tools/scripts/forge/queue-acceptance.spec.ts`, `tools/scripts/forge/train-fallback.ts`, `tools/scripts/forge/train-fallback.spec.ts`, `tools/scripts/forge/train-rehearsal.script.ts`, `tools/scripts/forge/train-rehearsal.ts`, `tools/scripts/forge/train-rehearsal.interface.ts`, `tools/scripts/forge/train-rehearsal.spec.ts`, `tools/scripts/git/refresh-candidate-artifacts.script.ts`, `tools/scripts/governance/forge-settings.lib.ts`, `tools/scripts/governance/forge-settings.lib.spec.ts`, `tools/scripts/lint/commit-branch-discipline.script.ts`, `tools/scripts/lint/commit-branch-discipline.script.spec.ts`, `package.json`
- **Gate**: none
- acceptance:
  - "Train refs and their dispatch, culprit markers, bisection, the train grace and the train fallback paths are gone."
  - "The guard, the ruleset and the commit-branch lint admit <ns>/queue/ through ownedTrainPrefixes in core; existing delendai/train/* refs are deleted by the queue."

### S3 — Queue refs stay off local clones
- **Status**: pending
- **Files**: `packages/core/src/lib/startup-reconciler/queue-refs-local.service.ts`, `packages/core/tests/src/lib/startup-reconciler/queue-refs-local.service.spec.ts`, `packages/core/src/lib/startup-reconciler/git-seam.ts`, `packages/core/src/lib/startup-reconciler/seams.interface.ts`, `packages/core/src/lib/startup-reconciler/phases/fetch-refs.ts`, `packages/core/src/lib/startup-reconciler/reconcile-startup.ts`, `packages/cli/src/commands/init/init.command.ts`
- **Gate**: none
- acceptance:
  - "init and startup add a negative fetch refspec for the queue namespace (git >= 2.29, else skip with a note) and delete existing remote-tracking queue and train refs."
  - "With a real repo, after a fetch no queue ref exists locally."

### S4 — work status says what is built, what waits and what landed
- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/interfaces/change-request-forge.interface.ts`, `plugins/github/src/lib/change-request.helper.ts`, `plugins/github/tests/change-request.spec.ts`, `packages/core/src/lib/work-units/queue-standing.service.ts`, `packages/core/tests/src/lib/work-units/queue-standing.service.spec.ts`, `packages/core/src/lib/work-units/work-unit-status.service.ts`, `packages/state-telemetry/src/lib/status/contracts/interfaces/work-status.interface.ts`
- **Gate**: none
- acceptance:
  - "work status shows batch pull requests with their members, the waiting candidates with their reason and what landed in the last hour, from one forge read through the adapter."
