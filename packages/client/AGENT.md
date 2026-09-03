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

- packages/client/src/tests/create-plugin-script.spec.ts
- packages/client/src/tests/namespace-aware-services.spec.ts
- packages/client/src/tests/plugin-activation.service.spec.ts
- packages/client/src/tests/project-plugins.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

