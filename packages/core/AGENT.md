# AGENT.md — package `packages/core`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Project-agnostic MCP server core: deterministic tool registration, workspace path resolution, a CLI plugin loader (--plugins), meta-scaffolding (tools/prompts/skills/agents/plugins) and a hybrid project analyzer that recommends what an MCP server needs. No project-specific code.

## Public API

- __resetShutdownGuardForTests
- gracefulShutdown
- createMcpProject
- planRegistrationOrder
- DEFAULT_CORE_PATHS
- isMcpToolSurfaceMode
- MCP_TOOL_SURFACE_MODE
- createWorkspacePathProvider
- projectValue
- createInMemoryHandleStore
- DEFAULT_MODEL_CATALOG_LIMIT
- InMemoryModelCatalog
- MAX_MODEL_CATALOG_LIMIT
- ModelCatalogError

## Depends on

- @delendai/contracts
- @modelcontextprotocol/sdk
- zod

## Writes

_(none)_

## Entry points

- ./dist/index.js

## Tests

- packages/core/tests/config-schema.spec.ts
- packages/core/tests/derive-version.spec.ts
- packages/core/tests/lint-proposals.spec.ts
- packages/core/tests/release-finalize/index.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not introduce project-specific code; `@delendai/core` is project-agnostic.
- Do not read files via `node:fs`; always go through the `IFileReader` abstraction.

## Token hotspots

- `delendai_configuration_center` — 3,967 B total, 3,467 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)
- `delendai_create_project` — 3,702 B total, 395 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)
- `delendai_adopt_project` — 3,624 B total, 2,957 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)
- `delendai_scaffold` — 2,514 B total, 784 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)

<!-- delendai:end agent-md -->

