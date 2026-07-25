# `@mcp-vertex/database`

Driver-agnostic database introspection + query tools for mcp-vertex.

## Slice status (proposal f00128)

| Slice | Status | Description |
|-------|--------|-------------|
| S1    | **done** | Schema introspection (`db_schema`, `db_probe`). Pure read. |
| S2    | pending | Query guard + EXPLAIN (slice tracked separately). |
| S3    | pending | ERD rendering (slice tracked separately). |

## Public surface

```ts
import {
	buildSchema,
	createSqliteDriver,
	buildDatabaseSchemaToolRegistrations,
	type IDatabaseDriver,
} from '@mcp-vertex/database/public';
```

Hosts can mount the same tools the plugin mounts (`db_schema`,
`db_probe`) without depending on the plugin's private structure.

## Optional peer dependency

`better-sqlite3` is an optional peer dependency. The SQLite driver
returns a typed `install-required` envelope when the package is not
present, so the plugin never throws at boot time. Hosts that only need
the introspection engine against a fake driver (tests, dry-runs)
require no install.

```bash
bun add better-sqlite3
```

## License

MIT