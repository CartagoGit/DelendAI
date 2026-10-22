---
id: f00786
title: "A hop on another vendor carries the delegated task, not a free prompt, under the target model's own budget"
kind: feat
status: in-progress
type: proposal
track: architecture
date: 2026-10-22
last-transition-id: b2060779-cac6-4435-b210-018389117b06
last-correlation-id: b2060779-cac6-4435-b210-018389117b06
last-transition-from: ready
last-transition-at: 2026-10-22T08:09:49.298Z
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
- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/tools/invoke.tool.ts`, `plugins/orchestrator-runner/src/lib/invoke/task-pack.service.ts`
- **Gate**: type
- acceptance:
  - "`invoke` accepts, beside `task`, an optional `delegated` object in the `IDelegatedTask` shape (`@delendai/contracts`); exactly one of `task` and `delegated` is required, and an old caller passing only `task` behaves as today."
  - "A delegated task is rendered into the worker's prompt as named sections — objective, acceptance (as the orchestrator will check it), the tools it may call, the context, and what was asked for but could not be given — never the caller's conversation."
  - "A spec renders a delegated task with missing context and asserts the missing items are named in the prompt, so 'no context' and 'context unreadable' never look alike to the worker."

### S2 — The budget is the target model's, read from the catalogue
- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/invoke/task-pack-budget.service.ts`, `packages/core/src/lib/shared/model-catalogue.service.ts`
- **Gate**: type
- acceptance:
  - "The input budget of a hop is a declared share of the target model's context window from the public model catalogue, capped by the delegated task's own `inputBudget`; a model the catalogue does not list keeps the task's budget, and the hop says which rule applied."
  - "A rendered prompt over the budget is refused before any process starts, naming its size and the budget, as `DelegationTooLargeError` does for host subagents; nothing is truncated silently."
  - "A spec drives two models with different context windows over the same task and asserts their budgets differ and the smaller one refuses a pack the larger one accepts."

### S3 — The bytes a hop was given are recorded with it
- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/invoke/manager.ts`
- **Gate**: type
- acceptance:
  - "The hop journal entry records whether the hop went with a delegated task or an instruction only, the rendered prompt's bytes, and the budget it was held to — the `IDelegationRecord` vocabulary (`delegation`, `manifestBytes`) the host path already uses."
  - "A spec asserts a delegated hop and an instruction-only hop journal differently, and that no prompt text is journalled, only its size."

## acceptance

- `invoke` accepts, beside `task`, an optional `delegated` object in the `IDelegatedTask` shape (`@delendai/contracts`); exactly one of `task` and `delegated` is required, and an old caller passing only `task` behaves as today.
- A delegated task is rendered into the worker's prompt as named sections — objective, acceptance (as the orchestrator will check it), the tools it may call, the context, and what was asked for but could not be given — never the caller's conversation.
- A spec renders a delegated task with missing context and asserts the missing items are named in the prompt, so 'no context' and 'context unreadable' never look alike to the worker.
- The input budget of a hop is a declared share of the target model's context window from the public model catalogue, capped by the delegated task's own `inputBudget`; a model the catalogue does not list keeps the task's budget, and the hop says which rule applied.
- A rendered prompt over the budget is refused before any process starts, naming its size and the budget, as `DelegationTooLargeError` does for host subagents; nothing is truncated silently.
- A spec drives two models with different context windows over the same task and asserts their budgets differ and the smaller one refuses a pack the larger one accepts.
- The hop journal entry records whether the hop went with a delegated task or an instruction only, the rendered prompt's bytes, and the budget it was held to — the `IDelegationRecord` vocabulary (`delegation`, `manifestBytes`) the host path already uses.
- A spec asserts a delegated hop and an instruction-only hop journal differently, and that no prompt text is journalled, only its size.
