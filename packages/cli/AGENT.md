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

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

