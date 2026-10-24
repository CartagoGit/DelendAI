# AGENT.md — plugin `plugins/database`

> Below the `<!-- delendai:begin agent-md -->
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
- @delendai/core
- better-sqlite3

## Writes

- <host workspace>/.delendai/cache/database/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/database/src/lib/erd/build-mermaid-er.spec.ts
- plugins/database/src/lib/erd/render-erd.spec.ts
- plugins/database/src/lib/introspect/introspect-engine.spec.ts
- plugins/database/src/lib/query/query-engine.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

