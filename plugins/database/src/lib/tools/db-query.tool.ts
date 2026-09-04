import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolJson } from '@delendai/core/public';

import type { IDriverKind } from '../introspect/introspect-engine';
import {
	createSqliteQueryDriver,
	type CreateSqliteQueryDriverResult,
} from '../query/sqlite-query-driver';
import { executeGuardedQuery, explainQuery } from '../query/query-engine';

export interface IDatabaseQueryToolOptions {
	readonly namespacePrefix: string;
	readonly resolveDsn?: () => string | undefined;
	readonly createDriver?: (
		dsn: string,
	) => Promise<CreateSqliteQueryDriverResult>;
}

const driverSchema = z.enum(['sqlite', 'postgres', 'mysql']);

const queryInputSchema = z
	.object({
		sql: z.string().min(1),
		params: z.array(z.unknown()).optional(),
		namedParams: z.record(z.string(), z.unknown()).optional(),
		allowWrite: z.boolean().optional(),
		confirm: z.boolean().optional(),
		dryRun: z.boolean().optional(),
		explainDriver: driverSchema.optional(),
	})
	.refine(
		(value) =>
			!(value.params !== undefined && value.namedParams !== undefined),
		{
			message: 'Use either params or namedParams, not both.',
			path: ['namedParams'],
		},
	);

const queryOutputSchema = z.union([
	z.object({
		ok: z.literal(true),
		classification: z.enum(['read', 'write', 'ddl', 'unknown']),
		dryRun: z.boolean(),
		rows: z.array(z.record(z.string(), z.unknown())).optional(),
		rowCount: z.number().int().nonnegative().optional(),
		plan: z.array(z.string()).optional(),
	}),
	z.object({
		ok: z.literal(false),
		error: z.enum(['write-refused', 'ddl-refused', 'explain-unsupported']),
		reason: z.string(),
		classification: z.enum(['write', 'ddl', 'unknown']),
		dryRun: z.boolean().optional(),
	}),
]);

const explainInputSchema = z.object({
	sql: z.string().min(1),
	params: z.array(z.unknown()).optional(),
	namedParams: z.record(z.string(), z.unknown()).optional(),
	explainDriver: driverSchema.optional(),
});

const explainOutputSchema = z.union([
	z.object({
		ok: z.literal(true),
		plan: z.array(z.string()),
	}),
	z.object({
		ok: z.literal(false),
		error: z.enum(['write-refused', 'ddl-refused', 'explain-unsupported']),
		reason: z.string(),
		classification: z.enum(['write', 'ddl', 'unknown']),
	}),
]);

const loadDriver = async (
	resolveDsn: () => string | undefined,
	createDriver: (dsn: string) => Promise<CreateSqliteQueryDriverResult>,
) => {
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
	return result.driver;
};

const projectExplain = (plan: readonly string[]) =>
	explainOutputSchema.parse({ ok: true, plan });

const asExplainDriver = (value: unknown): IDriverKind | undefined =>
	value === 'sqlite' || value === 'postgres' || value === 'mysql'
		? value
		: undefined;

const toQueryInput = (input: z.infer<typeof queryInputSchema>) => {
	const explainDriver = asExplainDriver(input.explainDriver);
	return {
		sql: input.sql,
		...(input.params !== undefined ? { params: input.params } : {}),
		...(input.namedParams !== undefined
			? { namedParams: input.namedParams }
			: {}),
		...(input.allowWrite !== undefined
			? { allowWrite: input.allowWrite }
			: {}),
		...(input.confirm !== undefined ? { confirm: input.confirm } : {}),
		...(input.dryRun !== undefined ? { dryRun: input.dryRun } : {}),
		...(explainDriver !== undefined ? { explainDriver } : {}),
	};
};

const toExplainInput = (input: z.infer<typeof explainInputSchema>) => {
	const explainDriver = asExplainDriver(input.explainDriver);
	return {
		sql: input.sql,
		...(input.params !== undefined ? { params: input.params } : {}),
		...(input.namedParams !== undefined
			? { namedParams: input.namedParams }
			: {}),
		...(explainDriver !== undefined ? { explainDriver } : {}),
	};
};

export const buildDatabaseQueryToolRegistrations = (
	options: IDatabaseQueryToolOptions,
): readonly IToolRegistration[] => {
	const resolveDsn =
		options.resolveDsn ??
		((): string | undefined => process.env.DATABASE_URL);
	const createDriver = options.createDriver ?? createSqliteQueryDriver;

	return [
		{
			id: 'db_query',
			summary:
				'Run a guarded SQL query. Read-only by default; write/DDL blocked unless explicitly confirmed.',
			tags: ['database', 'query', 'read-only'],
			effects: ['network'],
			register: async (server) => {
				server.registerTool(
					`${options.namespacePrefix}_db_query`,
					{
						description:
							'Run a parameterized SQL query. Read-only by default; writes require allowWrite:true and confirm:true. dryRun defaults to true and returns the read plan without executing.',
						inputSchema: queryInputSchema,
						outputSchema: queryOutputSchema,
					},
					async (args) => {
						const driver = await loadDriver(
							resolveDsn,
							createDriver,
						);
						if ('content' in driver) {
							return driver;
						}
						try {
							const input = queryInputSchema.parse(args);
							const result = await executeGuardedQuery(
								driver,
								toQueryInput(input),
							);
							return toolJson(queryOutputSchema.parse(result));
						} catch (err) {
							return toolError(
								'query-failed',
								(err as Error).message,
							);
						}
					},
				);
			},
		},
		{
			id: 'db_explain',
			summary:
				'Return the EXPLAIN plan for a read-only SQL statement without executing it.',
			tags: ['database', 'query', 'plan'],
			effects: ['network'],
			register: async (server) => {
				server.registerTool(
					`${options.namespacePrefix}_db_explain`,
					{
						description:
							'Return an EXPLAIN plan for a parameterized read query. Mutations and DDL are rejected.',
						inputSchema: explainInputSchema,
						outputSchema: explainOutputSchema,
					},
					async (args) => {
						const driver = await loadDriver(
							resolveDsn,
							createDriver,
						);
						if ('content' in driver) {
							return driver;
						}
						try {
							const input = explainInputSchema.parse(args);
							const result = await explainQuery(
								driver,
								toExplainInput(input),
							);
							if (!result.ok) {
								return toolJson(
									explainOutputSchema.parse(result),
								);
							}
							return toolJson(projectExplain(result.plan ?? []));
						} catch (err) {
							return toolError(
								'explain-failed',
								(err as Error).message,
							);
						}
					},
				);
			},
		},
	];
};
