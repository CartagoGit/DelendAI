# AGENT.md — package `packages/test-kit`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Internal, test-only helpers shared across @mcp-vertex workspaces (never published). Home of the typed partial-fake helper that replaces `as unknown as T` casts in test files.

## Public API

- fakePartial
- createFakeToolServer
- asArray

## Depends on

_(none)_

## Writes

_(none)_

## Entry points

_(none)_

## Tests

- packages/test-kit/tests/src/lib/as-array.spec.ts
- packages/test-kit/tests/src/lib/fake-partial.spec.ts
- packages/test-kit/tests/src/lib/fake-tool-server.spec.ts

## Do not

- Do not introduce project-specific code; `@mcp-vertex/core` is project-agnostic.
- Do not read files via `node:fs`; always go through the `IFileReader` abstraction.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

