---
id: f00786
title: "A hop on another vendor carries the delegated task, not a free prompt, under the target model's own budget"
kind: feat
status: in-progress
type: proposal
track: architecture
date: 2026-10-22
last-transition-id: cd2bd939-17e3-45f3-8a50-76dc90c2d2a1
last-correlation-id: cd2bd939-17e3-45f3-8a50-76dc90c2d2a1
last-transition-from: ready
last-transition-at: 2026-11-01T06:35:38.015Z
shipped-in:
  - "34c56b60e3229de38164cc30bf1cc079c5da29ee"
---

# f00786 — A hop on another vendor carries the delegated task, not a free prompt, under the target model's own budget

## goal

q00034 S5. When the runner sends work to a CLI, ACP or API worker on another vendor, that worker receives the same delegated task a host subagent already receives — objective, acceptance, allowed tools, the compiled context, what could not be given — rendered for it, under an input budget derived from the target model's context window rather than one number for every model, and the bytes it was given are recorded with the hop.

## why

agent-orchestrator already compiles an `IDelegatedTask` for each step (`delegation-manifest.service.ts:126-185`): the objective, the acceptance, `allowedTools`, a context manifest of the task's files and the context-for-change sections around them, `missingContext`, and a token budget it refuses to exceed (`DelegationTooLargeError`). A host subagent gets it through `spawnSubagent({ task })` (`linear-dispatcher.ts:206-209`).

A hop through orchestrator-runner gets none of it. `invoke` takes `task: string` (`invoke.tool.ts:140-151`) and every invoker forwards that string as the prompt (`subprocess/cli.ts`, `subprocess/api.ts`, `invoke/acp-invoker.service.ts`). So the worker on another vendor — the cheap model q00034 exists to use — starts from whatever text the caller typed: either too little (it re-reads the project and spends its quota finding what the manifest already holds) or the parent's conversation pasted in (it spends its quota reading what it does not need). This is the 'cheap failure is the expensive one' of q00034's fifth fact, still open for the runner.

The budget is also one number: `inputBudget: policy.defaults.budget.maxTokensPerSubagent` (`agent-orchestrator/src/index.ts:228`), the same for a 32k-context model and a 1M-context one. The model catalogue f00783 ships knows each model's context window; nothing reads it here.

f00774 (in review) scopes the tools a hop may call; this proposal scopes what it is told. Together they bound both halves of a hop's base cost.

## non-goals

- Changing how agent-orchestrator compiles a manifest, or its sources. The runner consumes the compiled task; it does not compile its own.
- Giving a worker on another vendor delendai's MCP server. A worker that has it reads context by reference through the same tools; one that has not gets the compiled context inline, within the budget.
- The learned store of hop outcomes (f00768). This proposal records the bytes a hop was given in the hop journal, which f00768 reads.

## slices

- global_gate: type

### S1 — invoke accepts a delegated task and renders it for the worker
- **Status**: done
- **Files**: `plugins/orchestrator-runner/src/lib/tools/invoke.tool.ts`, `plugins/orchestrator-runner/src/lib/invoke/task-pack.service.ts`, `plugins/orchestrator-runner/package.json`, `plugins/orchestrator-runner/tests/src/lib/invoke/task-pack.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/tools/invoke-delegated.spec.ts`
- **Gate**: type
- acceptance:
  - "`invoke` accepts, beside `task`, an optional `delegated` object in the `IDelegatedTask` shape (`@delendai/contracts`); exactly one of `task` and `delegated` is required, and an old caller passing only `task` behaves as today."
  - "A delegated task is rendered into the worker's prompt as named sections — objective, acceptance (as the orchestrator will check it), the tools it may call, the context, and what was asked for but could not be given — never the caller's conversation."
  - "A spec renders a delegated task with missing context and asserts the missing items are named in the prompt, so 'no context' and 'context unreadable' never look alike to the worker."
- shipped-in: `a9690a70a62d`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 34c56b60e322, validate exit 0, tests 8/8; acceptance 3/3: (1) The tool's input schema carries a `DelegatedTaskSchema` with exactly the `IDelegatedTask` fields - objective, contractHash, manifestId, allowedTools, outputSch… (2) `renderTaskPack` renders the task into named sections - '## Objective', '## Acceptance (the orchestrator checks these)', '## Tools you may call', '## Context',… (3) The spec 'names every section of the task, and what could not be given' renders the task whose `missingContext` names an unreadable file and asserts the prompt… — Gate is `type`: `bun run typecheck` exits 0 in this worktree. Verified: `invoke` takes a delegated task in the `IDelegatedTask` shape beside `task`, exactly one of the two, and a caller passing only `task` behaves as before; the task is rendered into named sections (objective, acceptance as the orchestrator checks it, the tools it may call, the context, what was asked for but could not be given) and never the caller's conversation; and a spec renders a delegated task with missing context and asserts the missing items are named, so no context and unreadable context do not look alike. The slice's specs pass 8/8. Delivery: the slice's commit is a9690a70a62d, merged as 34c56b60e32 (PR #1361).

### S2 — The budget is the target model's, read from the catalogue
- **Status**: done
- **Files**: `plugins/orchestrator-runner/src/lib/invoke/task-pack-budget.service.ts`, `plugins/orchestrator-runner/src/lib/contracts/constants/task-pack.constant.ts`, `plugins/orchestrator-runner/src/lib/contracts/interfaces/task-pack.interface.ts`, `packages/core/src/lib/shared/model-catalogue.service.ts`, `packages/core/src/lib/contracts/interfaces/account-finding.interface.ts`, `packages/core/src/lib/contracts/constants/public-catalogues.constant.ts`, `packages/core/data/model-catalogue.snapshot.json`, `packages/core/src/cli.ts`, `packages/core/tests/src/lib/shared/model-catalogue.service.spec.ts`
- **Gate**: type
- acceptance:
  - "The input budget of a hop is a declared share (`HOP_CONTEXT_WINDOW_SHARE`, half) of the target model's context window — from the public model catalogue, which now keeps each model's `limit.context` (format 3, so a cached copy is refetched), else from the roster entry — capped by the delegated task's own `inputBudget`; a model whose window is unknown keeps the task's budget, and the journal says which rule applied (`model-window`, `task`, `none`)."
  - "A rendered prompt over the budget is refused before any quota is held or process started, naming its size and the budget, as `DelegationTooLargeError` does for host subagents; nothing is truncated silently, and the refusal is per provider, so a model with a larger window next in the fallback chain may still take the pack."
  - "A spec drives two models with different context windows over the same task and asserts their budgets differ and the smaller one refuses a pack the larger one accepts."
- shipped-in: `28e0212bd416`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 34c56b60e322, validate exit 0, tests 23/23; acceptance 3/3: (1) `hopInputBudget` takes the target model's context window, multiplies it by the declared `HOP_CONTEXT_WINDOW_SHARE` (0.5, plugins/orchestrator-runner/src/lib/co… (2) The refusal is taken in `runOne` before `holdQuota` is called and before any process starts; the hop is journalled as 'blocked' with the reason, and the messag… (3) The spec 'holds two models to their own windows, under the task budget' drives an 8,000-token model and a 1,000,000-token model over the same task: the first i… — Gate is `type`: `bun run typecheck` exits 0 in this worktree. Verified: the hop budget is half the target model's context window as the public catalogue states it (format 3 keeps `limit.context`), else the roster entry, capped by the task's own `inputBudget`, with the rule that applied (`model-window`, `task`, `none`) in the journal; a pack over the budget is refused before any quota is held or process started, naming size and budget, and the refusal is per provider so a larger window next in the fallback chain may still take it; and a spec drives two models with different windows over the same task and asserts the budgets differ and the smaller refuses a pack the larger accepts. The slice's specs pass 23/23. Delivery: the slice's commit is 28e0212bd416, merged as 34c56b60e32 (PR #1361).

### S3 — The bytes a hop was given are recorded with it
- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/invoke/manager.ts`, `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`, `plugins/orchestrator-runner/src/lib/contracts/interfaces/invocation-journal.interface.ts`, `plugins/orchestrator-runner/src/index.ts`, `plugins/orchestrator-runner/tests/src/lib/invoke/manager-journal.spec.ts`
- **Gate**: type
- acceptance:
  - "The hop journal entry records whether the hop went with a delegated task or an instruction only, the rendered prompt's bytes, and the budget it was held to — the `IDelegationRecord` vocabulary (`delegation`, `manifestBytes`) the host path already uses."
  - "A spec asserts a delegated hop and an instruction-only hop journal differently, and that no prompt text is journalled, only its size."
- shipped-in: `a9690a70a62d`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: requested_changes by minimax-m3.1-flash-preview — The hop journal entry does not speak the `IDelegationRecord` vocabulary the criterion names; it declares a parallel, plugin-local type. The delivered record is `IHopDelegation { kind: 'manifest' | 'instruction-only'; promptBytes: number; budget?: IHopBudget }` (plugins/orchestrator-runner/src/lib/contracts/interfaces/task-pack.interface.ts:22-27) and the journal entry holds it as `delegation?: IHopDelegation` (plugins/orchestrator-runner/src/lib/contracts/interfaces/invocation-journal.interface.ts:34-35). The shared contract the criterion names is `IDelegationRecord` in `@delendai/contracts`: `delegation: IDelegationKind` ('manifest' | 'instruction-only') and `manifestBytes?: number` (packages/contracts/src/delegated-task.interface.ts:42-60). WHAT IS MISSING: the record names the discriminant `kind` where the criterion says `delegation`, and the byte count `promptBytes` where the criterion says `manifestBytes`, and it re-spells the union instead of importing `IDelegationKind`. WHY IT MATTERS: the reader of the shared vocabulary already exists - `delegationsOf` accepts an entry only when it carries `tags`, `tokensUsed` and a `delegation` of 'manifest' or 'instruction-only' (plugins/usage-tracking/src/lib/services/invocation-recorder.service.ts:42-54) - so a hop record in this shape is silently dropped by the uniform reader the host path feeds, and f00768, the learned store of hop outcomes that this proposal's own non-goals name as the reader of these bytes, would have to know two spellings of the same thing. HOW TO REPRODUCE: compare plugins/orchestrator-runner/src/lib/contracts/interfaces/task-pack.interface.ts:22-27 with packages/contracts/src/delegated-task.interface.ts:52-60 and observe the differently named discriminant and byte count. WHAT MUST HOLD: the hop journal's delegation record is the shared `IDelegationRecord` vocabulary - the discriminant field is `delegation` with the values of `IDelegationKind` and the byte count is `manifestBytes` - extended with the hop's budget rather than replaced by a second type, the way plugins/agent-orchestrator/src/lib/dispatch/contracts.ts:40 already extends it (`Omit<IDelegationRecord, 'tags'>`); the budget may ride alongside as an extra field. The spec 'journals a delegated hop with the budget its model holds it to' (tests/src/lib/invoke/manager-journal.spec.ts:167-181) must then assert the shared field names.

## acceptance

- `invoke` accepts, beside `task`, an optional `delegated` object in the `IDelegatedTask` shape (`@delendai/contracts`); exactly one of `task` and `delegated` is required, and an old caller passing only `task` behaves as today.
- A delegated task is rendered into the worker's prompt as named sections — objective, acceptance (as the orchestrator will check it), the tools it may call, the context, and what was asked for but could not be given — never the caller's conversation.
- A spec renders a delegated task with missing context and asserts the missing items are named in the prompt, so 'no context' and 'context unreadable' never look alike to the worker.
- The input budget of a hop is a declared share (`HOP_CONTEXT_WINDOW_SHARE`, half) of the target model's context window — from the public model catalogue, which now keeps each model's `limit.context` (format 3, so a cached copy is refetched), else from the roster entry — capped by the delegated task's own `inputBudget`; a model whose window is unknown keeps the task's budget, and the journal says which rule applied (`model-window`, `task`, `none`).
- A rendered prompt over the budget is refused before any quota is held or process started, naming its size and the budget, as `DelegationTooLargeError` does for host subagents; nothing is truncated silently, and the refusal is per provider, so a model with a larger window next in the fallback chain may still take the pack.
- A spec drives two models with different context windows over the same task and asserts their budgets differ and the smaller one refuses a pack the larger one accepts.
- The hop journal entry records whether the hop went with a delegated task or an instruction only, the rendered prompt's bytes, and the budget it was held to — the `IDelegationRecord` vocabulary (`delegation`, `manifestBytes`) the host path already uses.
- A spec asserts a delegated hop and an instruction-only hop journal differently, and that no prompt text is journalled, only its size.
