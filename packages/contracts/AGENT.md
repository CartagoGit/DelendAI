# AGENT.md — package `packages/contracts`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Pure-TypeScript type-only contracts shared across the mcp-vertex ecosystem. NO Node imports, NO @mcp-vertex/core dependency. Plugins and external consumers can depend on this package without dragging in the runtime weight of `@mcp-vertex/core`.

## Public API

_(none)_

## Depends on

_(none)_

## Writes

_(none)_

## Entry points

- ./dist/index.js

## Tests

- packages/contracts/tests/src/no-node-imports.spec.ts
- packages/contracts/tests/src/envelopes.spec.ts

## Do not

- Do not introduce project-specific code; `@mcp-vertex/core` is project-agnostic.
- Do not read files via `node:fs`; always go through the `IFileReader` abstraction.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

