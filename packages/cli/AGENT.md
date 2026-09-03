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

- packages/cli/src/commands/doctor.spec.ts
- packages/cli/src/commands/groups/agents.spec.ts
- packages/cli/src/commands/groups/conventions.spec.ts
- packages/cli/src/commands/groups/core.spec.ts

## Do not

- Do not introduce project-specific code; `@mcp-vertex/core` is project-agnostic.
- Do not read files via `node:fs`; always go through the `IFileReader` abstraction.

## Token hotspots

- packages/cli/src/lib/init/init-answers.schema.ts

<!-- mcp-vertex:end agent-md -->

