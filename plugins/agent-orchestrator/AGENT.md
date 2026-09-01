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
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/agent-orchestrator/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/agent-orchestrator/tests/src/index.spec.ts
- plugins/agent-orchestrator/tests/src/lib/policy/single-mode.spec.ts
- plugins/agent-orchestrator/tests/src/lib/policy/per-mode-override.spec.ts
- plugins/agent-orchestrator/tests/src/lib/policy/registry.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

