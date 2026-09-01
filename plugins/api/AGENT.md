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

_(none)_

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

