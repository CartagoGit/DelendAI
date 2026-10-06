/**
 * f00128 S1 — public surface of the database plugin.
 *
 * Hosts import from `@delendai/database/public` to reuse the
 * driver-agnostic introspection engine and the tool registration
 * builder (so unit tests in the host can mount the same tools without
 * re-typing them).
 */
// Introspection engine (driver-agnostic)
export type {
	IColumnInfo,
	IColumnType,
	IDatabaseDriver,
	IDatabaseSchema,
	IForeignKeyInfo,
	IIndexInfo,
	ITableInfo,
} from '../lib/introspect/introspect-engine';
export {
	buildSchema,
	normaliseColumnType,
	redactDsn,
} from '../lib/introspect/introspect-engine';

// SQLite driver factory (returns an install-hint envelope when the
// peer dep is missing; never throws).
export type { CreateSqliteDriverResult } from '../lib/introspect/sqlite-driver';
export { createSqliteDriver, dsnToPath } from '../lib/introspect/sqlite-driver';

// Fake driver (tests)
export type { IFakeDatabaseFixture } from '../lib/introspect/fake-driver';
export { buildFakeDriver, SAMPLE_FIXTURE } from '../lib/introspect/fake-driver';

// Tool registrations
export type { IDatabaseSchemaToolOptions } from '../lib/tools/db-schema.tool';
export { buildDatabaseSchemaToolRegistrations } from '../lib/tools/db-schema.tool';
// S2 — query guard + EXPLAIN
export type { IDatabaseQueryToolOptions } from '../lib/tools/db-query.tool';
export { buildDatabaseQueryToolRegistrations } from '../lib/tools/db-query.tool';

// S3 — ERD rendering
export type { IDatabaseErdToolOptions } from '../lib/tools/db-erd.tool';
export { buildDatabaseErdToolRegistrations } from '../lib/tools/db-erd.tool';
export type { IRelationshipKind } from '../lib/erd/build-mermaid-er';
export {
	buildMermaidEr,
	classifyForeignKeyRelationship,
	countRelationships,
	filterSchemaTables,
	isForeignKeyUnique,
} from '../lib/erd/build-mermaid-er';
export {
	listEntityBlocks,
	renderErd,
	renderErdIntegrity,
	safeEntityName,
} from '../lib/erd/render-erd';
