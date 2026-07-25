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
import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { buildDatabaseQueryToolRegistrations } from './lib/tools/db-query.tool';
import { buildDatabaseSchemaToolRegistrations } from './lib/tools/db-schema.tool';

const OptionsSchema = z.object({
	resolveDsn: z.custom<() => string | undefined>().optional(),
});

export default definePlugin({
	name: 'database',
	version: '0.1.0',
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
		return {
			tools: [
				...buildDatabaseSchemaToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					...(opts.resolveDsn !== undefined
						? { resolveDsn: opts.resolveDsn }
						: {}),
				}),
				...buildDatabaseQueryToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					...(opts.resolveDsn !== undefined
						? { resolveDsn: opts.resolveDsn }
						: {}),
				}),
			],
		};
	},
});
