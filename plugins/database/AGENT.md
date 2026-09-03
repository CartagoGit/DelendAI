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

## Depends on

- zod
- @mcp-vertex/core
- better-sqlite3

## Writes

- <host workspace>/.mcp-vertex/cache/database/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/database/src/lib/erd/build-mermaid-er.spec.ts
- plugins/database/src/lib/erd/render-erd.spec.ts
- plugins/database/src/lib/introspect/introspect-engine.spec.ts
- plugins/database/src/lib/query/query-engine.spec.ts

## Do not

- Do not import `@mcp-vertex/core/lib/...`; use `@mcp-vertex/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- mcp-vertex:end agent-md -->

