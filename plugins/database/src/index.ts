/**
 * f00128 S1 — `database` plugin entry point.
 *
 * S1: schema introspection (`db_schema`, `db_probe`).
 * S2: query guard + EXPLAIN (separate proposal slice).
 * S3: ERD rendering (separate proposal slice).
 *
 * `better-sqlite3` is an optional peer dependency: the SQLite driver
 * returns an `install-required` envelope at runtime when the package
 * is not installed, so hosts without a SQLite binding can still load
 * the plugin and run the introspection engine against a fake driver.
 */
import { definePlugin } from '@delendai/core/public';
import z from 'zod';

import { buildDatabaseErdToolRegistrations } from './lib/tools/db-erd.tool';
import { buildDatabaseQueryToolRegistrations } from './lib/tools/db-query.tool';
import { buildDatabaseSchemaToolRegistrations } from './lib/tools/db-schema.tool';

const OptionsSchema = z.object({
	dsn: z
		.string()
		.describe(
			'Database DSN env:DATABASE_URL provider:database capability:Database introspection DSN',
		)
		.optional(),
	resolveDsn: z.custom<() => string | undefined>().optional(),
});

export default definePlugin({
	name: 'database',
	version: '0.1.1',
	describe:
		'Database introspection + query tools (f00128). Pure-read S1; query guard S2; ERD S3.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`database plugin rejected its options: ${parsed.error.message}`,
			);
		}
		const opts = parsed.data;
		const resolveDsn =
			opts.resolveDsn ??
			(opts.dsn !== undefined ? () => opts.dsn : undefined);
		return {
			tools: [
				...buildDatabaseErdToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					...(resolveDsn !== undefined ? { resolveDsn } : {}),
				}),
				...buildDatabaseSchemaToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					...(resolveDsn !== undefined ? { resolveDsn } : {}),
				}),
				...buildDatabaseQueryToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					...(resolveDsn !== undefined ? { resolveDsn } : {}),
				}),
			],
			knowledge: [
				{
					id: 'database-erd-usage',
					title: 'Database ERD generation',
					body: [
						'# Database ERD generation',
						'',
						`Tool: \`${ctx.namespacePrefix}_db_erd\` — introspect the current database and return a deterministic mermaid ER diagram.`,
						'',
						'- Use the optional `tables` array to focus the diagram on a subset of entities; relationships are kept only when both ends are selected.',
						'- The payload includes `mermaid`, `tableCount`, `relationshipCount`, and a compact `summary` for quick routing.',
						'- The returned `erDiagram` string can be pasted directly into docs pages, wiki pages, or rendered alongside the diagram plugin mermaid output in the docs site.',
						'- Pairs with the diagram plugin work tracked in f00132: both tools emit mermaid for the same docs/rendering pipeline.',
					].join('\n'),
				},
			],
		};
	},
});
