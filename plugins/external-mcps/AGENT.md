# AGENT.md — plugin `plugins/external-mcps`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Compose third-party MCP servers through the catalog + human ack.

## Public API

_(none)_

## Depends on

- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/external-mcps/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/external-mcps/src/lib/subprocess/env-filter.spec.ts
- plugins/external-mcps/tests/src/lib/activation-policy.spec.ts
- plugins/external-mcps/tests/src/lib/catalog.spec.ts
- plugins/external-mcps/tests/src/lib/configuration-metadata.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

