# AGENT.md — plugin `plugins/observability`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Observability surface (metrics, errors, telemetry).

## Public API

- authHeaderFor
- dispatchFetch
- redactToken
- buildProvenanceGraph
- PROVENANCE_NODE_KINDS
- PROVENANCE_RELATION_DEFINITIONS
- listRecentErrors
- normalizeLevel
- sentryBuildListUrl
- sentryParseList
- buildObsErrorsToolRegistration
- buildObsHealthToolRegistration
- buildObsRuntimeMetricsToolRegistration
- createRuntimeMetricsRegistry

## Depends on

- @mcp-vertex/core
- @mcp-vertex/web-fetch

## Writes

- <host workspace>/.mcp-vertex/cache/observability/

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

