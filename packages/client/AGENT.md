# AGENT.md — package `packages/client`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- IDE-agnostic TypeScript client for talking to an mcp-vertex server over MCP stdio.

## Public API

- McpStdioClient
- McpToolError
- logHintFromResult
- payloadFromResult
- DEFAULT_NAMESPACE_PREFIX
- formatToolName
- parsePrefix
- OverviewService
- normalizeTool
- normalizeCompactTools
- pluginFromToolName
- KnowledgeNotFoundError
- KnowledgeService
- categoryOf

## Depends on

- @mcp-vertex/core
- @modelcontextprotocol/sdk
- zod

## Writes

_(none)_

## Entry points

- ./dist/index.js

## Tests

- packages/client/tests/architecture/no-node-outside-client-node.spec.ts
- packages/client/tests/e2e/mcp-stdio-client.e2e.spec.ts
- packages/client/tests/node/runtime-events.spec.ts
- packages/client/tests/services/configuration-center.service.spec.ts

## Do not

- Do not introduce project-specific code; `@mcp-vertex/core` is project-agnostic.
- Do not read files via `node:fs`; always go through the `IFileReader` abstraction.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

