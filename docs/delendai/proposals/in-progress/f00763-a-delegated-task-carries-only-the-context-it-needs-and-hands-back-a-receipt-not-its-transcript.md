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

- **Status**: pending
- **Files**:
  - `plugins/agent-orchestrator/src/lib/dispatch/delegation-manifest.service.ts`
  - `plugins/agent-orchestrator/package.json`
- **Gate**: type
- decision (2026-10-14): the orchestrator reads the task's context through ports it is given (the files `context-for-change` names, the facts `memory` holds, the effective configuration), wired from those plugins' public entries only when they are loaded. Each source's items are put into the file artifact store of S2a and compiled into one manifest, whose id the `IDelegatedTask` carries. With no source loaded, the step goes as a manifest with no references rather than as an instruction only, and says which sources were missing.
- acceptance:
  - Each delegated step gets a manifest built with `context-compiler`: the files `context-for-change` names for the task, the facts `memory` holds for this project, and the effective project configuration. References are by hash, so the subagent expands only what it opens.
  - A step whose manifest would exceed its input budget is split or escalated, not sent whole.

### S3 — A host adapter turns the manifest into a bounded prompt

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/subagents/delegation-prompt.helper.ts`
- **Gate**: type
- acceptance:
  - A host that runs subagents through its own tool (a `Task`-like call) gets a prompt rendered from the manifest: objective, constraints, references to open, tools to use, the output to return. Nothing from the parent conversation goes in.
  - A host that can enforce the manifest (an adapter with context control) is used as such, and the receipt says which of the two happened.

### S4 — The subagent hands back a receipt

- **Status**: pending
- **Files**:
  - `packages/contracts/src/host-subagent-runtime.interface.ts`
  - `plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts`
- **Gate**: type
- acceptance:
  - The orchestrator receives a compact receipt: status, files changed, the checks run and their result, the tokens observed, references to the full output and logs, and only the exceptions that need its decision. The full output is stored behind a reference, not returned.

### S5 — The saving is measured

- **Status**: pending
- **Files**:
  - `plugins/usage-tracking/src/index.ts`
- **Gate**: type
- acceptance:
  - Each delegation records the subagent's observed input and output tokens, the manifest size, and whether more context was requested. A report compares delegations with and without a manifest on the same kinds of task, observed figures apart from estimates.

## acceptance

- A delegated subagent starts from its manifest, not from the session, and the orchestrator reads a receipt, not a transcript.
- How much this saves is measured, not assumed.
