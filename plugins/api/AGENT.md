# AGENT.md — plugin `plugins/api`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- REST/GraphQL API surface for mcp-vertex plugins.

## Public API

- parseOpenApi
- fetchAndParseSpec
- buildRequest
- coerceValue
- buildApiCallToolRegistration
- buildApiValidateToolRegistration
- buildApiValidateToolRegistrations
- resolveResponseSchema
- validateResponse
- generateMockFromSchema
- generateOperationMock
- mockHappyPath
- mockResponseForStatus
- buildApiMockToolRegistration

## Depends on

- @mcp-vertex/core
- @mcp-vertex/web-fetch

## Writes

- <host workspace>/.mcp-vertex/cache/api/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/api/src/lib/mock/mock-engine.spec.ts
- plugins/api/src/lib/spec/openapi.spec.ts
- plugins/api/src/lib/tools/api-call.tool.spec.ts
- plugins/api/src/lib/tools/api-mock.tool.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

