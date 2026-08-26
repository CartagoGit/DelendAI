# AGENT.md — plugin `plugins/database`

> Below the `<!-- mcp-vertex:begin agent-md -->
## Purpose

- Database schema/introspection tools (read-only, offline).

## Public API

- buildSchema
- normaliseColumnType
- redactDsn
- createSqliteDriver
- dsnToPath
- buildFakeDriver
- SAMPLE_FIXTURE
- buildDatabaseSchemaToolRegistrations
- buildDatabaseQueryToolRegistrations
- buildDatabaseErdToolRegistrations
- buildMermaidEr
- classifyForeignKeyRelationship
- countRelationships
- filterSchemaTables
- isForeignKeyUnique
- listEntityBlocks
- renderErd
- renderErdIntegrity
- safeEntityName

## Depends on

- @mcp-vertex/core
- zod
- better-sqlite3

## Writes

- <host workspace>/.mcp-vertex/cache/database/

## Entry points

- ./src/index.ts
- src/index.ts (default export → IMcpPlugin)

## Tests

_(none)_

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

