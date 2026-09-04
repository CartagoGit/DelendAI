# AGENT.md — package `packages/cli`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Human-facing delendai CLI with local and stdio transports.

## Public API

_(none)_

## Depends on

- @delendai/auto-agent-selector
- @delendai/client
- @delendai/core
- @delendai/env
- zod

## Writes

_(none)_

## Entry points

- ./dist/index.js

## Tests

- packages/cli/src/commands/config-jsonc.spec.ts
- packages/cli/src/commands/doctor.spec.ts
- packages/cli/src/commands/groups/agents.spec.ts
- packages/cli/src/commands/groups/conventions.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

