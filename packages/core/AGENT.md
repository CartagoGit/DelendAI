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
- buildHostAdapterPack
- buildHostCapabilityPlan
- classifyPath
- DEFAULT_TS_RULES
- endsWithBasename
- hasSegment
- deriveSourceRoots
- mergeDerivedConfig
- assembleCliConfig
- buildConfigurationCenterSnapshot
- readConfigurationCenterSection
- serializeConfigurationSchema
- FIRST_PARTY_SCOPE
- PERMISSION_CATEGORIES
- PERMISSION_RISK_WEIGHTS
- buildActivationReport

## Depends on

- @modelcontextprotocol/sdk
- zod

## Writes

_(none)_

## Entry points

- ./dist/index.js

## Tests

- packages/core/tests/config-schema.spec.ts
- packages/core/tests/src/public/public-logs-api.spec.ts
- packages/core/tests/src/lib/shared/contain-path.spec.ts
- packages/core/tests/src/lib/shared/with-file-mutex.property.spec.ts
- packages/core/tests/src/lib/shared/truncate-if-too-large.spec.ts
- packages/core/tests/src/lib/shared/checkpoint-advisory.spec.ts

## Do not

- Do not introduce project-specific code; `@mcp-vertex/core` is project-agnostic.
- Do not read files via `node:fs`; always go through the `IFileReader` abstraction.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

