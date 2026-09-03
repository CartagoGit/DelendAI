# AGENT.md — package `packages/core`

> Below the `<!-- mcp-vertex:begin agent-md -->
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

- Do not introduce project-specific code; `@mcp-vertex/core` is project-agnostic.
- Do not read files via `node:fs`; always go through the `IFileReader` abstraction.

## Token hotspots

- packages/core/src/lib/manifest/permissions.schema.ts
- packages/core/src/lib/proposals/validate-evidence.schema.ts

<!-- mcp-vertex:end agent-md -->

