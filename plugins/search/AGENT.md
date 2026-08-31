# AGENT.md — plugin `plugins/search`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Code search (semantic + symbol + references).

## Public API

- default
- searchWorkspace
- InvalidSearchPatternError
- buildSearchToolRegistrations
- buildDeterministicHashEmbedder
- defaultEmbedder
- DEFAULT_EMBED_DIMENSIONS
- buildApiEmbedder
- EmbedderUnavailableError
- discoverProviders
- resolveProviderApiKey
- createEmbedIndexStore
- resolveEmbedIndexPath
- discoverEmbeddableFiles

## Depends on

- @modelcontextprotocol/sdk
- zod
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/search/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/search/tests/src/lib/embed/build-api-embedder.spec.ts
- plugins/search/tests/src/lib/embed/embed-pipeline.spec.ts
- plugins/search/tests/src/lib/embed/embedder.spec.ts
- plugins/search/tests/src/lib/embed/index-store.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

