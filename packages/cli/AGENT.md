# AGENT.md — package `packages/cli`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Human-facing DelendAI CLI. Single canonical bin `delendai` (S1); bridges for legacy bin names live in the WORKSPACE via `delendai bridge install` (S3).

## Public API

_(none)_

## Depends on

- @agentclientprotocol/sdk
- @delendai/agent-orchestrator
- @delendai/auto-agent-selector
- @delendai/client
- @delendai/completion
- @delendai/container
- @delendai/conventions
- @delendai/core

## Writes

_(none)_

## Entry points

- ./dist/index.js

## Tests

- packages/cli/src/commands/accounts.command.spec.ts
- packages/cli/src/commands/agents.command.spec.ts
- packages/cli/src/commands/alias.command.spec.ts
- packages/cli/src/commands/bridge.command.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

