/**
 * f00128 S1 — `db_schema` and `db_probe` tools.
 *
 * Thin adapters over the introspect engine. The driver is injected so
 * tests pass an in-memory fake; production resolves the driver from
 * the DATABASE_URL env var via `createSqliteDriver`. The DSN is read
 * but never echoed back — install hint errors get redacted.
 *
 * Output schema is the same `IDatabaseSchema` projection used by S2
 * (query guard) and S3 (ERD), so the three slices can stack without
 * reformatting.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolJson } from '@delendai/core/public';

import {
	buildSchema,
	type IDatabaseSchema,
	type ITableInfo,
} from '../introspect/introspect-engine';
import type { CreateSqliteDriverResult } from '../introspect/sqlite-driver';
import { createSqliteDriver } from '../introspect/sqlite-driver';

export interface IDatabaseSchemaToolOptions {
	readonly namespacePrefix: string;
	/**
	 * DSN resolver. Production reads from `process.env.DATABASE_URL`;
	 * tests inject a fixed value. Returning `undefined` surfaces a
	 * typed `installHint` envelope (no throw).
	 */
	readonly resolveDsn?: () => string | undefined;
	/**
	 * Injectable driver factory. Defaults to `createSqliteDriver`. The
	 * factory contract is intentionally narrow so a future
	 * Postgres/MySQL driver can be wired in without changing the tool.
	 */
	readonly createDriver?: (dsn: string) => Promise<CreateSqliteDriverResult>;
}

const columnSchema = z.object({
	name: z.string(),
	type: z.string(),
	nullable: z.boolean(),
	primaryKey: z.boolean(),
	defaultValue: z.string().nullable(),
});

const indexSchema = z.object({
	name: z.string(),
	unique: z.boolean(),
	columns: z.array(z.string()),
});

const foreignKeySchema = z.object({
	name: z.string(),
	fromTable: z.string(),
	fromColumns: z.array(z.string()),
	toTable: z.string(),
	toColumns: z.array(z.string()),
});

const tableSchema = z.object({
	name: z.string(),
	schema: z.string().nullable(),
	columns: z.array(columnSchema),
	indexes: z.array(indexSchema),
	foreignKeys: z.array(foreignKeySchema),
});

const SCHEMA_OUTPUT_SCHEMA = z.object({
	driver: z.enum(['sqlite', 'postgres', 'mysql']),
	tables: z.array(tableSchema),
});

const PROBE_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	driver: z.enum(['sqlite', 'postgres', 'mysql', 'none']),
	hint: z.string().optional(),
});

/** Project the introspect output through zod so the JSON envelope is contract-clean. */
const projectSchema = (
	schema: IDatabaseSchema,
): z.infer<typeof SCHEMA_OUTPUT_SCHEMA> =>
	SCHEMA_OUTPUT_SCHEMA.parse({
		driver: schema.driver,
		tables: schema.tables.map((t: ITableInfo) => ({
			name: t.name,
			schema: t.schema,
			columns: t.columns.map((c) => ({
				name: c.name,
				type: c.type,
				nullable: c.nullable,
				primaryKey: c.primaryKey,
				defaultValue: c.defaultValue,
			})),
			indexes: t.indexes.map((i) => ({
				name: i.name,
				unique: i.unique,
				columns: [...i.columns],
			})),
			foreignKeys: t.foreignKeys.map((fk) => ({
				name: fk.name,
				fromTable: fk.fromTable,
				fromColumns: [...fk.fromColumns],
				toTable: fk.toTable,
				toColumns: [...fk.toColumns],
			})),
		})),
	});

export const buildDatabaseSchemaToolRegistrations = (
	options: IDatabaseSchemaToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	const resolveDsn =
		options.resolveDsn ??
		((): string | undefined => process.env.DATABASE_URL);
	const createDriver = options.createDriver ?? createSqliteDriver;

	const probe = async () => {
		const dsn = resolveDsn();
		if (!dsn) {
			return {
				ok: false,
				driver: 'none',
				hint: 'DATABASE_URL not set — export DATABASE_URL=file:./app.db to enable.',
			} as const;
		}
		const result = await createDriver(dsn);
		if (!result.ok) {
			return {
				ok: false,
				driver: 'none',
				hint: result.hint,
			} as const;
		}
		return {
			ok: true,
			driver: result.driver.kind,
			hint: undefined,
		} as const;
	};

	const loadSchema = async () => {
		const dsn = resolveDsn();
		if (!dsn) {
			return toolError(
				'DATABASE_URL not set',
				'Export DATABASE_URL (e.g. file:./app.db) and retry.',
			);
		}
		const result = await createDriver(dsn);
		if (!result.ok) {
			return toolError('install-required', result.hint);
		}
		try {
			const schema = await buildSchema(result.driver);
			return toolJson(projectSchema(schema));
		} catch (err) {
			return toolError('introspection-failed', (err as Error).message);
		}
	};

	return [
		{
			id: 'db_schema',
			summary:
				'List every user table in the database (columns, indexes, foreign keys). Read-only.',
			tags: ['database', 'schema', 'read-only'],
			effects: ['network'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_db_schema`,
					{
						inputSchema: z.object({}),
						description:
							'Introspect the database schema (tables, columns, indexes, foreign keys). Pure read; refuses if DATABASE_URL is unset or the driver is missing.',
						outputSchema: SCHEMA_OUTPUT_SCHEMA,
					},
					async () => loadSchema(),
				);
			},
		},
		{
			id: 'db_probe',
			summary:
				'Probe the database connection (driver kind, presence) without running any query.',
			tags: ['database', 'probe', 'read-only'],
			effects: ['network'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_db_probe`,
					{
						inputSchema: z.object({}),
						description:
							'Check whether DATABASE_URL is set and the declared driver is reachable. Never throws; returns an install hint when the driver is missing.',
						outputSchema: PROBE_OUTPUT_SCHEMA,
					},
					async () => {
						const result = await probe();
						if (!result.ok) {
							return toolJson({
								ok: false,
								driver: result.driver,
								...(result.hint !== undefined
									? { hint: result.hint }
									: {}),
							});
						}
						return toolJson({ ok: true, driver: result.driver });
					},
				);
			},
		},
	];
};
