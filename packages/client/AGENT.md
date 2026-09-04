# AGENT.md — package `packages/client`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- IDE-agnostic TypeScript client for talking to an delendai server over MCP stdio.

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

- @modelcontextprotocol/sdk
- zod
- @delendai/core

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
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

