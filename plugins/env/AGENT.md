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
- @mcp-vertex/core

## Writes

- <host workspace>/.mcp-vertex/cache/env/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/env/tests/src/lib/validate/check-schema.spec.ts
- plugins/env/tests/src/lib/validate/env-schema.spec.ts
- plugins/env/tests/src/lib/requirements/explain.spec.ts
- plugins/env/tests/src/lib/requirements/extract.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

