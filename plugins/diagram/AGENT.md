# AGENT.md — plugin `plugins/diagram`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Diagram generator (mermaid, dot) from code structure.

## Public API

- buildDependencyGraph
- renderMermaid
- buildModuleGraph
- moduleDisplayName
- renderModuleMermaid
- realDiagramDeps
- realDiagramModules
- buildDiagramGraphToolRegistrations
- buildMermaidEr
- buildProposalDfaMermaid
- buildDiagramProposalsToolRegistrations

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/database
- @mcp-vertex/proposals
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/diagram/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/diagram/tests/src/lib/build-graph.spec.ts
- plugins/diagram/tests/src/lib/graph/build-module-graph.spec.ts
- plugins/diagram/tests/src/lib/tools/diagram-graph.tool.spec.ts
- plugins/diagram/tests/src/lib/tools/diagram-proposals.tool.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

