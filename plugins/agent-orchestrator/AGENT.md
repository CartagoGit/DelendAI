# AGENT.md — plugin `plugins/agent-orchestrator`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Workflow policy plugin: single / linear / swarm / auto modes with token budgets, iteration caps, and mid-task subagent rotation.

## Public API

- DEFAULT_BUDGET_POLICY
- DEFAULT_ROTATION_POLICY
- ORCHESTRATION_MODES
- OrchestratorPolicySchema
- ModeOverrideSchema
- PerModeOverridesSchema
- resolveEffectivePolicyForMode
- ModeRegistry
- UnknownModeError
- DuplicateModeError
- OrchestratorEngine
- createOrchestratorEngine
- assertPolicyValid
- SingleModeAdapter

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.mcp-vertex/cache/agent-orchestrator/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/agent-orchestrator/tests/src/index.spec.ts
- plugins/agent-orchestrator/tests/src/lib/budget/budget-tracker.spec.ts
- plugins/agent-orchestrator/tests/src/lib/classifier/regression.spec.ts
- plugins/agent-orchestrator/tests/src/lib/classifier/task-classifier.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

- `mcp-vertex_agent-orchestrator_dispatch` — 2,423 B total, 1,684 B of it `outputSchema` (measured, see docs/mcp-vertex/TOKEN-BUDGETS.md)
- `mcp-vertex_agent-orchestrator_plan` — 2,337 B total, 1,539 B of it `outputSchema` (measured, see docs/mcp-vertex/TOKEN-BUDGETS.md)

<!-- mcp-vertex:end agent-md -->

