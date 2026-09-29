# AGENT.md — plugin `plugins/cache`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Cache-eviction rules and lifecycle for plugin scratch dirs.

## Public API

- buildStaticRules
- CACHE_OWNER
- registerStaticRules
- buildGcRegistration

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/cache/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/cache/tests/registry.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

