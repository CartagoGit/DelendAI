---
id: f00768
title: "One record of how each model did, and one ranking that reads it"
kind: feat
status: in-progress
type: proposal
track: batuta
date: 2026-10-19
parent: q00034
last-transition-id: fe7ac2a2-6603-45d4-b2a1-d6922771800d
last-correlation-id: fe7ac2a2-6603-45d4-b2a1-d6922771800d
last-transition-from: ready
last-transition-at: 2026-10-19T00:07:25.800Z
---

# f00768 — One record of how each model did, and one ranking that reads it

## goal

Every hop a model runs leaves one outcome record — which provider and account, which kind of task, whether the task's own acceptance held, what it cost and how long it took — in one store; one ranking, in core, reads that store, the remaining quota of each account (f00767) and the person's cost↔quality dial, and every component that chooses a model asks it. A choice names the evidence it rests on, or says it had none. This is q00034 S4.

## why

Two rankings choose a provider and neither knows the other: `auto-agent-selector`'s `rankProviders` (`plugins/auto-agent-selector/src/lib/routing/rank-providers.ts`) sorts by a cost↔quality dial blended with win rates from its calibration store; `orchestrator-runner`'s `scoreProvider` (`plugins/orchestrator-runner/src/lib/router/score.ts`) scores capability matches, the task's mode and the cost tier, and calls itself "the CANONICAL home of the scoring function". The same task can be routed two ways depending on which tool an agent called.

What was learned is scattered and thin: the calibration record holds only `providerId`, `success` and an optional `taskType` (`calibration.interface.ts`); the runner's invocation journal records each hop's state and, since f00767, what its account had left, but nothing about whether the work was any good; `prompt-eval` says it writes win rates into the calibration store, but that write-through is unimplemented ("tracked separately under f00127") and its `eval_run` has no runtime. So no component can answer "which model does this kind of task best for what I have left", the question the owner asked on 2026-10-18.

## non-goals

- Merging `usage-tracking`: it records MCP tool calls, not model hops, and stays a separate log that correlates by invocation.
- Choosing for the person: the dial and pins stay theirs.

## slices

- global_gate: type

### S1 — One outcome record and its store

- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/interfaces/model-outcome.interface.ts`, `packages/core/src/lib/contracts/constants/model-outcomes.constant.ts`, `packages/core/src/lib/shared/model-outcome-store.service.ts`, `packages/core/src/lib/cache/migrations/model-outcomes.migration.ts`, `packages/core/src/lib/cache/cache-layout-migrations.registry.ts`, `packages/core/src/lib/contracts/constants/cache-layout.constant.ts`, `packages/core/src/lib/contracts/constants/cache-layout-migration.constant.ts`, `packages/core/src/runtime/index.ts`, `packages/core/src/contracts/index.ts`, `packages/core/tests/src/lib/shared/model-outcome-store.service.spec.ts`, `packages/core/tests/src/lib/cache/migrations/cache-layout-history.spec.ts`, `plugins/auto-agent-selector/src/lib/calibrate/store.ts`, `plugins/auto-agent-selector/src/index.ts`, `plugins/auto-agent-selector/tests/src/lib/calibrate/store.spec.ts`, `plugins/orchestrator-runner/src/lib/invoke/manager.ts`, `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`, `plugins/orchestrator-runner/src/index.ts`, `plugins/orchestrator-runner/tests/src/lib/invoke/manager-journal.spec.ts`, `tools/scripts/lint/architecture-readfile-via-safe-reader.baseline.json`, `tools/scripts/lint/cache-layout-ratchet.snapshot.json`
- **Gate**: type
- acceptance:
  - "One outcome record, declared in core contracts, carries provider, account, task kind, outcome (`accepted`, `rejected`, `failed`, `unknown` — the task's own acceptance where it ran), tokens in and out when known, cost with its kind (`measured`, `estimated`, `included-in-plan`), latency and retries; one append-only store, under the shared cache, holds it. The calibration log's existing lines read as records with an `unknown` cost, so nothing learned is lost."
  - "The runner appends a record when a hop ends (`unknown` when it ended, `failed` when it did not — ending is not acceptance), joining its journal entry by invocation id; the selector's calibration reads and writes through the same store, counting only judged outcomes; a start-up cache migration (epoch 5 -> 6) moves the old calibration log into it. `prompt-eval`'s write-through, unimplemented, is left to f00127, which now has this store to append to. Specs hold a hop's record, an old calibration line read back, and the move."

### S2 — One ranking, in core

- **Status**: pending
- **Files**: `packages/core/src/lib/shared/model-ranking.service.ts`, `packages/core/src/lib/contracts/constants/model-ranking.constant.ts`, `packages/core/src/lib/contracts/interfaces/model-ranking.interface.ts`, `packages/core/tests/src/lib/shared/model-ranking.service.spec.ts`, `plugins/auto-agent-selector/src/lib/routing/rank-providers.ts`, `plugins/auto-agent-selector/src/lib/calibrate/win-rates.ts`, `plugins/auto-agent-selector/src/lib/contracts/constants/calibration.constant.ts`, `plugins/auto-agent-selector/src/lib/contracts/interfaces/ranking.interface.ts`, `plugins/auto-agent-selector/tests/src/lib/routing/rank-providers.spec.ts`, `plugins/auto-agent-selector/tests/src/lib/calibrate/win-rates.spec.ts`, `plugins/orchestrator-runner/src/lib/router/score.ts`, `plugins/orchestrator-runner/tests/src/lib/router/score.spec.ts`
- **Gate**: type
- acceptance:
  - "One ranking in core takes the roster, the task (kind, capabilities, mode), the outcome records, each account's remaining quota and verdict (f00766, f00767), the dial and any pin, and returns the providers in order, each with the evidence that placed it (its records for that task kind and how many, or none). `rankProviders`, `scoreProvider`/`explainScore` and (through `rankProviders`) `adaptive-optimizer` delegate to it and keep no weights of their own — the selector's calibration constants and win-rate fold are core's; a named cost preference is a position of the dial (`minimize` 9, `balanced` 5, `maximize` 1) and cost is one continuous term, so the runner's and the selector's choices agree; a provider that cannot work now is listed last with why."
  - "Specs hold: with no records the order follows capabilities, mode and the dial (cheaper always first above the neutral dial); records for a task kind move a provider that does it well up, with the evidence named; an unavailable provider moves to the end with its reason; a pin stays first."

### S3 — What was learned can be asked

- **Status**: pending
- **Files**: `plugins/self-learning/src/index.ts`
- **Gate**: type
- acceptance:
  - "`self-learning` answers, from the outcome store, which provider did best per task kind, at what cost per accepted result, with the sample size each answer rests on; an answer on fewer samples than the ranking trusts says so. A spec holds it."

## acceptance

- After real hops (q00034 S7), asking which model to use for a kind of task gives the same answer whichever tool asks, with the outcomes, cost and quota it rests on.
