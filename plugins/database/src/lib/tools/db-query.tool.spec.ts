import { describe, expect, it } from 'vitest';

import {
	buildDatabaseQueryToolRegistrations,
	type IDatabaseQueryToolOptions,
} from './db-query.tool';
import type { CreateSqliteQueryDriverResult } from '../query/sqlite-query-driver';
import type { IPreparedQuery, IQueryDriver } from '../query/query-engine';

type ToolBody = {
	content: Array<{ text: string }>;
};

const captureHandler = async (
	options: IDatabaseQueryToolOptions,
	toolId: 'db_query' | 'db_explain',
) => {
	const registrations = buildDatabaseQueryToolRegistrations(options);
	const target = registrations.find(
		(registration) => registration.id === toolId,
	);
	if (!target) throw new Error(`unknown tool id ${toolId}`);
	let captured: ((args: unknown) => Promise<unknown>) | undefined;
	await target.register({
		registerTool: (
			_name: string,
			_desc: unknown,
			fn: (args: unknown) => Promise<unknown>,
		) => {
			captured = fn;
			return { dispose: () => undefined } as never;
		},
	} as never);
	if (!captured) throw new Error('handler not registered');
	return captured;
};

const call = async (
	handler: (args: unknown) => Promise<unknown>,
	args: unknown,
): Promise<Record<string, unknown>> => {
	const res = (await handler(args)) as ToolBody;
	return JSON.parse(res.content[0]?.text ?? '{}') as Record<string, unknown>;
};

const fakeDriver: IQueryDriver = {
	kind: 'sqlite',
	async execute(prepared: IPreparedQuery) {
		if (prepared.sql.includes('explode')) {
			throw new Error('driver error at file:/tmp/dev.db?password=secret');
		}
		if (prepared.sql.startsWith('update')) {
			return [{ changes: 1 }];
		}
		return [{ id: 1, email: 'ada@example.com' }];
	},
	async explain(prepared: IPreparedQuery) {
		return [`SCAN ${prepared.sql}`];
	},
};

const baseOptions: IDatabaseQueryToolOptions = {
	namespacePrefix: 'database',
	resolveDsn: () => 'file:./app.db',
	createDriver: async (): Promise<CreateSqliteQueryDriverResult> => ({
		ok: true,
		driver: fakeDriver,
	}),
};

describe('f00128 S2 db-query tool', () => {
	it('runs a read query and returns rows plus plan', async () => {
		const handler = await captureHandler(baseOptions, 'db_query');
		const body = await call(handler, {
			sql: 'select * from users where id = :id',
			namedParams: { id: 1 },
			dryRun: false,
		});
		expect(body.ok).toBe(true);
		expect(body.rows).toEqual([{ id: 1, email: 'ada@example.com' }]);
		expect(body.plan).toEqual(['SCAN select * from users where id = ?']);
	});

	it('refuses write queries by default', async () => {
		const handler = await captureHandler(baseOptions, 'db_query');
		const body = await call(handler, {
			sql: 'update users set email = ?',
			params: ['new@example.com'],
			dryRun: false,
		});
		expect(body).toEqual({
			ok: false,
			error: 'write-refused',
			reason: 'Mutating statements require both allowWrite:true and confirm:true.',
			classification: 'write',
		});
	});

	it('allows writes only when both allowWrite and confirm are set', async () => {
		const handler = await captureHandler(baseOptions, 'db_query');
		const body = await call(handler, {
			sql: 'update users set email = ?',
			params: ['new@example.com'],
			allowWrite: true,
			confirm: true,
			dryRun: false,
		});
		expect(body.ok).toBe(true);
		expect(body.rows).toEqual([{ changes: 1 }]);
	});

	it('never leaks DSN data in tool errors', async () => {
		const handler = await captureHandler(baseOptions, 'db_query');
		const body = await call(handler, {
			sql: 'select * from explode',
			dryRun: false,
		});
		expect(body.ok).toBe(false);
		const text = JSON.stringify(body);
		expect(text).toContain('file:/tmp/dev.db?password=***');
		expect(text).not.toContain('password=secret');
	});

	it('db_explain returns plan rows for read queries', async () => {
		const handler = await captureHandler(baseOptions, 'db_explain');
		const body = await call(handler, {
			sql: 'select * from users',
		});
		expect(body).toEqual({ ok: true, plan: ['SCAN select * from users'] });
	});

	it('db_explain refuses write queries', async () => {
		const handler = await captureHandler(baseOptions, 'db_explain');
		const body = await call(handler, {
			sql: 'delete from users where id = 1',
		});
		expect(body).toEqual({
			ok: false,
			error: 'write-refused',
			reason: 'Mutating statements require both allowWrite:true and confirm:true.',
			classification: 'write',
		});
	});
});
