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

- packages/contracts/tests/src/envelopes.spec.ts
- packages/contracts/tests/src/no-node-imports.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

