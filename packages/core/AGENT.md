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
- @delendai/state
- @modelcontextprotocol/sdk
- jsonc-parser
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

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not introduce project-specific code; `@delendai/core` is project-agnostic.
- Do not read files via `node:fs`; always go through the `IFileReader` abstraction.

## Token hotspots

- `delendai_configuration_center` — 3,796 B total, 3,334 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)
- `delendai_adopt_project` — 3,640 B total, 2,992 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)
- `delendai_create_project` — 3,632 B total, 343 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)
- `delendai_scaffold` — 2,741 B total, 732 B of it `outputSchema` (measured, see docs/delendai/TOKEN-BUDGETS.md)

<!-- delendai:end agent-md -->

