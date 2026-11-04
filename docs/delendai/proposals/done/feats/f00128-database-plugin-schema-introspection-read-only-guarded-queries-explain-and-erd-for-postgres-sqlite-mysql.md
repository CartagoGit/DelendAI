---
id: f00128
kind: feat
title: database plugin — schema introspection, read-only guarded queries, EXPLAIN and ERD for Postgres/SQLite/MySQL
status: done
date: 2026-07-23
track: plugin+database+data
shipped-in:
  - 94b12ccc # feat(f00128): S1 database plugin — schema introspection + db_schema/db_probe tools
  - 4fe7c307 # feat(f00128): S2 guarded query + EXPLAIN
  - 550b8264 # feat(f00128): S3 ERD rendering + catalog (db_erd)
---

# f00128 — database plugin

## goal

A `database` plugin that introspects a database schema, runs **read-only**
queries (write-guarded exactly like `fs_write`), returns `EXPLAIN` plans, and
emits an **ERD** (mermaid) — for Postgres, SQLite and MySQL — via safe,
parameterized drivers. Connection details come from the environment/DSN and are
**never logged**. Ships with the `data` auto-config pack.

## why

A database MCP server appears in every 2026 top-list — it is core adopter
value even though this repo itself has no database (hence tier-1.5, not
tier-1). Including it makes the toolkit "complete" for data-backed projects and
gives the `data` pack a reason to exist.

## why this design

**Read-only by default**, reusing the write-guard model already proven in
`fs_write`: mutating statements are refused unless an explicit opt-in +
`confirm` is set. Drivers are probed (r00012) and connections are parameterized
to prevent injection; the DSN is read from env and redacted from every output
and log. Result formatting is pure. The ERD emits mermaid so it renders in the
docs/site and pairs with the `diagram` plugin (f00132).

## non-goals

- No writes without explicit opt-in + confirm; no migration execution.
- No DSN/credential logging, ever; no bundled database engine.
- No ORM or query builder — raw parameterized SQL only.

## slices

### S1 — connection + schema introspection (read-only)

- **Status**: done
- **Files**: `plugins/database/src/lib/introspect/`, `plugins/database/src/lib/tools/db-schema.tool.ts`
- **Gate**: bun run validate
- **Closed-by**: 94b12ccc
- **Closed-evidence**:
  - `plugins/database/src/lib/introspect/{introspect-engine.ts,sqlite-driver.ts,fake-driver.ts}` — driver-agnostic engine with `redactDsn()` credential redaction.
  - `plugins/database/src/lib/tools/db-schema.tool.ts` — `db_schema` + `db_probe` tools; better-sqlite3 missing → typed `install-required` envelope.
  - Wired into `tsconfig.base.json`, `vitest.shared.ts`, `plugin-defaults.ts`, `preset-catalog.ts` (standard + vertex), `release-plan.ts` PUBLISH_ORDER.
  - 28/28 plugin tests pass; `verify:plugin-wiring:advisory` reports `database` fully wired.

`db_schema` lists tables/columns/indexes/relations over a probed driver; DSN
from env, redacted. Pure formatter over injected driver results.

### S2 — guarded query + EXPLAIN

- **Status**: done
- **Files**: `plugins/database/src/lib/query/`, `plugins/database/src/lib/tools/db-query.tool.ts`
- **Gate**: bun run validate
- **Closed-by**: 4fe7c307

`db_query` (read-only; refuses DML/DDL unless `allowWrite` + `confirm`),
`db_explain` for plans. Parameterized; write-guard unit-tested to reject
mutations by default. Implemented with a pure SQL classifier/parameter flattener,
SQLite query runner, redacted driver errors, and unit coverage for read, write,
DDL, EXPLAIN, and DSN-redaction paths.

### S3 — ERD + pack + catalog

- **Status**: done
- **Files**: `plugins/database/src/lib/erd/`, `plugins/database/README.md`
- **Gate**: bun run validate
- **Closed-by**: 550b8264

`db_erd` emits a mermaid ERD from the introspected schema; `data` pack
membership (r00011), catalog + wiki.
- implementation:
  - `erd/build-mermaid-er.ts` — deterministic `erDiagram` builder over an
    `IDatabaseSchema`; filters requested tables, classifies FK relationships
    (one-to-one / one-to-many / many-to-many), and counts emitted edges.
    Empty schema → `'erDiagram\n'`.
  - `erd/render-erd.ts` — pure Mermaid-safe entity renderer and sanitization
    layer (`safeEntityName`, `listEntityBlocks`, `renderErdIntegrity`) for
    reserved keywords, leading digits, and stable entity blocks.
  - `tools/db-erd.tool.ts` — resolves DSN, builds the schema, filters by
    optional `tables`, and returns strict zod output
    (`mermaid`, `tableCount`, `relationshipCount`, `summary`). Wired into
    `plugins/database/src/index.ts`.
  - `packages/core/src/lib/plugins/preset-catalog.ts` — `database` is present
    in the current preset catalog (`standard` and `vertex`).
  - `plugins/database/src/index.ts` publishes the `database-erd-usage`
    knowledge entry for catalog/wiki discovery.
  - `erd/build-mermaid-er.spec.ts` + `erd/render-erd.spec.ts` +
    `tools/db-erd.tool.spec.ts` — 33 ERD tests cover the formatter, the
    driver seam, and the tool envelope.
  - README updated with the new `db_erd` entry and ERD usage notes.
  - 61/61 plugin tests pass; `verify:plugin-wiring:advisory` still
    reports `database` fully wired.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- Introspects a fixture SQLite DB and runs a read-only query; a write is
  refused by default and allowed only with `allowWrite` + `confirm`.
- The DSN never appears in output or logs; a missing driver → install hint.
- `db_erd` produces valid mermaid for the fixture schema.

## notes

Reuses the `fs_write` write-guard model, r00012 (driver probe), and mermaid
rendering. Prior art: the Postgres/SQLite MCP servers. Pairs with f00132
(diagram) for the ERD.
