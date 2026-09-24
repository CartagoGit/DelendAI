# AGENT.md — plugin `plugins/search`

> Below the `<!-- delendai:begin agent-md -->
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
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/search/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/search/tests/src/lib/embed/build-api-embedder.spec.ts
- plugins/search/tests/src/lib/embed/embed-pipeline.spec.ts
- plugins/search/tests/src/lib/embed/embedder.spec.ts
- plugins/search/tests/src/lib/embed/index-store.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

