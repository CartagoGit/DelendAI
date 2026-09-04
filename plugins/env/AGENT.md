# AGENT.md — plugin `plugins/env`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Environment config validation (.env check + schema + env_explains).

## Public API

- checkEnv
- parseEnv
- runEnvCheck
- realEnvDeps
- buildSchemaFromRequirements
- loadRequirementsFromPluginNames
- explain
- extractRequirements
- checkSchema
- ENV_SCHEMA
- schemaKeys
- schemaRequired

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.mcp-vertex/cache/env/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/env/tests/src/lib/check-env.spec.ts
- plugins/env/tests/src/lib/requirements/explain.spec.ts
- plugins/env/tests/src/lib/requirements/extract.spec.ts
- plugins/env/tests/src/lib/tools/env-check.tool.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- mcp-vertex:begin -->`/`<!-- mcp-vertex:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

