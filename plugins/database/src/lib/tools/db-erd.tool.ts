import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolJson } from '@delendai/core/public';

import {
	buildMermaidEr,
	countRelationships,
	filterSchemaTables,
} from '../erd/build-mermaid-er';
import { buildSchema } from '../introspect/introspect-engine';
import type { CreateSqliteDriverResult } from '../introspect/sqlite-driver';
import { createSqliteDriver } from '../introspect/sqlite-driver';

export interface IDatabaseErdToolOptions {
	readonly namespacePrefix: string;
	readonly resolveDsn?: () => string | undefined;
	readonly createDriver?: (dsn: string) => Promise<CreateSqliteDriverResult>;
}

const inputSchema = z.object({
	tables: z.array(z.string().min(1)).optional(),
});

const outputSchema = z.object({
	mermaid: z.string(),
	tableCount: z.number().int().nonnegative(),
	relationshipCount: z.number().int().nonnegative(),
	summary: z.object({
		tables: z.number().int().nonnegative(),
		relationships: z.number().int().nonnegative(),
	}),
});

export const buildDatabaseErdToolRegistrations = (
	options: IDatabaseErdToolOptions,
): readonly IToolRegistration[] => {
	const resolveDsn =
		options.resolveDsn ??
		((): string | undefined => process.env.DATABASE_URL);
	const createDriver = options.createDriver ?? createSqliteDriver;

	return [
		{
			id: 'db_erd',
			summary:
				'Render the database schema as a deterministic mermaid ERD.',
			tags: ['database', 'docs'],
			effects: ['network'],
			register: async (server) => {
				server.registerTool(
					`${options.namespacePrefix}_db_erd`,
					{
						description:
							'Introspect the database schema and render it as a deterministic mermaid `erDiagram`. Optionally pass `tables` to keep only a subset of entities and relationships where both tables are selected.',
						inputSchema,
						outputSchema,
					},
					async (args) => {
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
							const input = inputSchema.parse(args);
							const schema = await buildSchema(result.driver);
							const filteredSchema = filterSchemaTables(
								schema,
								input.tables,
							);
							const relationshipCount =
								countRelationships(filteredSchema);
							return toolJson(
								outputSchema.parse({
									mermaid: buildMermaidEr(filteredSchema),
									tableCount: filteredSchema.tables.length,
									relationshipCount,
									summary: {
										tables: filteredSchema.tables.length,
										relationships: relationshipCount,
									},
								}),
							);
						} catch (err) {
							return toolError(
								'introspection-failed',
								(err as Error).message,
							);
						}
					},
				);
			},
		},
	];
};
