---
id: f00763
title: "a delegated task carries only the context it needs, and hands back a receipt, not its transcript"
kind: feat
status: in-progress
type: proposal
track: general
date: 2026-10-14
last-transition-id: 11bc0c08-aabc-465c-8a54-5c84e2c01e43
last-correlation-id: 11bc0c08-aabc-465c-8a54-5c84e2c01e43
last-transition-from: ready
last-transition-at: 2026-10-14T09:22:15.413Z
---

# f00763 — a delegated task carries only the context it needs, and hands back a receipt, not its transcript

## goal

Every task the orchestrator delegates to a subagent goes with a context manifest (objective, the project contract, the exact references, the allowed tools, the expected output and its acceptance checks, an input budget) compiled by context-compiler, and comes back as a compact receipt with measured cost, so a cheap subagent works without rebuilding the session and the expensive orchestrator pays only to decide.

## why

The owner, 2026-10-13: subagent efficiency fails today. With several subagents, each one takes an enormous context and burns tokens. The main agent should pass each one only what it needs and the instructions for the work, so the subagent sticks to its task on cheaper tokens, and the expensive agent guides it spending little: it orchestrates instead of doing the work itself. The outside review the same day (x00894) found why in the code:

1. **The delegation contract carries no context.** `packages/contracts/src/host-subagent-runtime.interface.ts`: an `IHostSubagentRequest` is `role`, `instruction`, `budget`, `slotId` and free `metadata`. Nothing says which files, facts or tools the subagent may use, so it rediscovers the project, or inherits the parent's whole conversation where the host passes it on.
2. **The piece that would do it is used by nobody.** `packages/context-compiler` builds context manifests and expands references by hash, and no package or plugin depends on it.
3. **What comes back is the whole answer.** `IHostSubagentResult.output` is the subagent's full text, and the orchestrator reads it all to decide what happened.
4. **The cost is not measured.** Before x00894 S4 the orchestrator's own spend was counted as one per step; the saving a delegation makes or loses has never been measured.

## non-goals

- Choosing models or providers (`auto-agent-selector`, f00551 Batuta): this decides what a delegated task carries, not who runs it.
- Hosts that give delendai no control over a subagent's context: they are told so, and get the best-effort prompt below.

## slices

- global_gate: type

### S1 — A delegated task is a manifest, not a prompt

- **Status**: in-progress
- **Files**:
  - `packages/contracts/src/delegated-task.interface.ts`
  - `packages/contracts/src/host-subagent-runtime.interface.ts`
  - `packages/contracts/src/index.ts`
  - `plugins/agent-orchestrator/src/lib/dispatch/contracts.ts`
  - `plugins/agent-orchestrator/src/lib/dispatch/port-resolution.helper.ts`
  - `plugins/agent-orchestrator/tests/src/lib/dispatch/port-resolution.helper.spec.ts`
- **Gate**: type
- acceptance:
  - `IDelegatedTask` carries an objective, the project contract's hash, a context manifest id, the allowed tools, the expected output schema, the acceptance checks, an input budget, and whether more context may be requested and through which tool; `IHostSubagentRequest.task` carries it.
  - The orchestrator's dispatch port passes a step's task to the host runtime, and marks every request's `metadata.delegation` as `manifest` or `instruction-only`: the current instruction-only request still works, and the gap stays measurable.

### S2a — context-compiler has a store and an engine to run on

- **Status**: in-progress
- **Files**:
  - `packages/core/src/lib/context-store/file-artifact-store.ts`
  - `packages/core/tests/src/lib/context-store/file-artifact-store.spec.ts`
  - `packages/state/src/lib/memo-derivation-engine.service.ts`
  - `packages/state/src/index.ts`
  - `packages/state/tests/src/lib/memo-derivation-engine.spec.ts`
- **Gate**: type
- decision (2026-10-14): `context-compiler` needs an `IArtifactStore` and an `IDerivationEngine`, and both existed only as interfaces in `packages/state`, implemented in specs alone: the compiler could not run anywhere. The derivation engine, pure, lives in `packages/state`; the file-backed store lives in core, because the state engine admits no Node import (`no-node-imports-in-state`).
- acceptance:
  - A file-backed `IArtifactStore` keeps each artifact by key, one file each, written whole and renamed into place, keeping its first `createdAt`; it lists by scope and kind and deletes.
  - A derivation engine derives a value once per input fingerprint and keeps it in the store when given one, so a restart does not derive it again.
  - `context-compiler` compiles a manifest of references against them, gives the same manifest for the same references, and expands a reference back to its content.

### S2b — The orchestrator compiles the manifest from the task

- **Status**: in-progress
- **Files**:
  - `plugins/agent-orchestrator/src/lib/dispatch/delegation-manifest.service.ts`
  - `plugins/agent-orchestrator/src/lib/contracts/interfaces/delegation-manifest.interface.ts`
  - `plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts`
  - `plugins/agent-orchestrator/src/lib/tools/dispatch.tool.ts`
  - `plugins/agent-orchestrator/src/index.ts`
  - `plugins/agent-orchestrator/package.json`
  - `plugins/agent-orchestrator/tests/src/lib/dispatch/delegation-manifest.service.spec.ts`
  - `packages/core/src/runtime/index.ts`
  - `packages/context-compiler/package.json`
  - `packages/context-compiler/README.md`
  - `tools/scripts/release/release-plan.ts`
  - `bun.lock`
- **Gate**: type
- decision (2026-10-14): the orchestrator reads the task's context through sources it is given, kept in the file artifact store of S2a and compiled into one manifest whose id the `IDelegatedTask` carries. `context-compiler` was private, and a published plugin may not depend on a private package (x00530), so it is published, after `@delendai/state` in the publish order.
- acceptance:
  - Each step `_dispatch` runs is delegated with a manifest compiled from the files its task names (read inside the workspace), the hash of the orchestration policy in force, and the policy's per-subagent token budget as its input budget; the same task gives the same manifest.
  - A step whose referenced context is over its input budget is not sent: it fails, so the orchestrator splits or escalates it.
  - The delegation is built on the first dispatch, so registering the plugin costs nothing.

### S2c — The code, docs and memory around a task's files join its manifest

- **Status**: in-progress
- **Files**:
  - `plugins/agent-orchestrator/src/lib/dispatch/delegation-manifest.service.ts`
  - `plugins/agent-orchestrator/src/index.ts`
  - `plugins/agent-orchestrator/package.json`
  - `plugins/agent-orchestrator/tests/src/lib/dispatch/delegation-manifest.service.spec.ts`
  - `bun.lock`
  - `plugins/agent-orchestrator/src/lib/dispatch/change-context-reader.helper.ts`
  - `plugins/agent-orchestrator/tests/src/lib/dispatch/change-context-reader.helper.spec.ts`
- **Gate**: type
- acceptance:
  - When the server has `context-for-change` loaded, each section it gathers for the files a task names (the code around them, the docs that cover them, the facts `memory` holds) is an item of the step's manifest, read with that plugin's own options. A task with no files asks it nothing, and what it cannot gather is simply not referenced.
  - `context-for-change` is an optional peer of agent-orchestrator: an install without it delegates with the task's own files only.

### S3 — A host adapter turns the manifest into a bounded prompt

- **Status**: in-progress
- **Files**:
  - `packages/core/src/lib/subagents/delegation-prompt.helper.ts`
  - `packages/core/tests/src/lib/subagents/delegation-prompt.helper.spec.ts`
  - `packages/core/src/runtime/index.ts`
  - `packages/contracts/src/host-subagent-runtime.interface.ts`
  - `plugins/agent-orchestrator/src/lib/dispatch/port-resolution.helper.ts`
  - `plugins/agent-orchestrator/tests/src/lib/dispatch/port-resolution.helper.spec.ts`
- **Gate**: type
- acceptance:
  - A host runtime that does not declare `enforcesManifest` receives, as the subagent's instruction, the manifest rendered as a bounded prompt: objective, the manifest and contract it may open (and through what), the tools it may use, its input budget, the checks it is done by and the receipt to return. Nothing from the parent conversation goes in.
  - A host that declares `enforcesManifest` gets the manifest as such, and every request says which of the two happened (`metadata.delegationPath`: `prompt` or `enforced`).

### S4 — The subagent hands back a receipt

- **Status**: in-progress
- **Files**:
  - `packages/contracts/src/host-subagent-runtime.interface.ts`
  - `plugins/agent-orchestrator/src/lib/dispatch/contracts.ts`
  - `plugins/agent-orchestrator/src/lib/dispatch/subagent-receipt.service.ts`
  - `plugins/agent-orchestrator/tests/src/lib/dispatch/subagent-receipt.service.spec.ts`
  - `plugins/agent-orchestrator/src/lib/tools/dispatch.tool.ts`
  - `plugins/agent-orchestrator/src/index.ts`
  - `docs/delendai/TOKEN-BUDGETS.md`
- **Gate**: type
- acceptance:
  - A host may return a receipt with the result: status (`done`, `failed`, `needs-decision`), the files changed, the checks run and their result, and only the exceptions that need the orchestrator's decision.
  - The outcome `_dispatch` returns gives each receipt on one line (`done · files: a.ts · checks: typecheck ok · needs: none`) and keeps each output longer than 280 characters behind a reference to the artifact store (`outputRef`), with a 280-character extract, so the orchestrator reads a receipt, not a transcript. One line rather than the structure keeps the plugin's tool surface under its hard token budget, and is what the model reads anyway.

### S5 — The saving is measured

- **Status**: pending
- **Files**:
  - `plugins/usage-tracking/src/index.ts`
- **Gate**: type
- decision (2026-10-14): the receipts are not persisted today (`closeReceipt` only returns them), and agent-orchestrator's tool surface sits near its hard token budget, so the report is not a new orchestrator tool. Each dispatch hands one record per delegated step (task tags, delegation `manifest` or `instruction-only`, path `prompt` or `enforced`, manifest bytes, the subagent's observed input and output tokens, whether more context was asked for) to usage-tracking, which already persists records; its report groups them by task kind and compares the two kinds of delegation, observed figures apart from estimates.
- acceptance:
  - Each delegation records the subagent's observed input and output tokens, the manifest size, and whether more context was requested. A report compares delegations with and without a manifest on the same kinds of task, observed figures apart from estimates.

## acceptance

- A delegated subagent starts from its manifest, not from the session, and the orchestrator reads a receipt, not a transcript.
- How much this saves is measured, not assumed.
