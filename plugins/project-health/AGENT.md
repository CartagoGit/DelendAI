# AGENT.md — plugin `plugins/project-health`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Compact project-health aggregator: cheap summary first, lazy domain details on demand.

## Public API

- default
- buildProjectHealthToolRegistrations
- ProjectHealthOutputSchema
- runProjectHealth

## Depends on

- @mcp-vertex/deps
- @mcp-vertex/quality
- @mcp-vertex/security
- @mcp-vertex/tech-debt
- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/project-health/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/project-health/tests/src/lib/services/project-health.service.spec.ts
- plugins/project-health/tests/src/project-health.tool.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

