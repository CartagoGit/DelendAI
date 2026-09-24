# AGENT.md — plugin `plugins/project-health`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Compact project-health aggregator: cheap summary first, lazy domain details on demand.

## Public API

- default
- buildProjectHealthToolRegistrations
- ProjectHealthOutputSchema
- runProjectHealth

## Depends on

- @delendai/deps
- @delendai/quality
- @delendai/security
- @delendai/tech-debt
- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/project-health/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/project-health/tests/src/lib/services/project-health.service.spec.ts
- plugins/project-health/tests/src/project-health.tool.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

