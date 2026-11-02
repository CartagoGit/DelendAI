# AGENT.md — plugin `plugins/env`

> Below the `<!-- delendai:begin agent-md -->
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

- <host workspace>/.delendai/cache/env/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/env/tests/src/lib/check-env.spec.ts
- plugins/env/tests/src/lib/env/real-deps.spec.ts
- plugins/env/tests/src/lib/requirements/explain.spec.ts
- plugins/env/tests/src/lib/requirements/extract.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

