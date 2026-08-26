# AGENT.md — package `packages/cli`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Human-facing mcp-vertex CLI with local and stdio transports.

## Public API

_(none)_

## Depends on

- @mcp-vertex/auto-agent-selector
- @mcp-vertex/client
- @mcp-vertex/core
- @mcp-vertex/env
- zod

## Writes

_(none)_

## Entry points

- ./dist/index.js

## Tests

_(none)_

## Do not

- Do not introduce project-specific code; `@mcp-vertex/core` is project-agnostic.
- Do not read files via `node:fs`; always go through the `IFileReader` abstraction.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

