/**
 * f00128 S1 — db_schema tool tests.
 *
 * Exercises the four behaviours S1 promises:
 * - db_probe returns ok=true when the fake driver loads.
 * - db_probe returns ok=false (driver:none) when DATABASE_URL is unset.
 * - db_schema produces the projected `IDatabaseSchema` for the fixture.
 * - db_schema returns a typed `install-required` envelope when the
 *   driver factory rejects (mirrors a host that has not installed
 *   better-sqlite3 yet).
 * - db_schema propagates driver errors as introspection-failed and
 *   redacts the DSN inside the nextAction message.
 */
import { describe, expect, it } from 'vitest';

import {
	buildDatabaseSchemaToolRegistrations,
	type IDatabaseSchemaToolOptions,
} from './db-schema.tool';
import { buildFakeDriver, SAMPLE_FIXTURE } from '../introspect/fake-driver';
import type { CreateSqliteDriverResult } from '../introspect/sqlite-driver';
import type { IDatabaseDriver } from '../introspect/introspect-engine';

type ToolBody = {
	content: Array<{ text: string }>;
};

const captureHandler = async (
	options: IDatabaseSchemaToolOptions,
	toolId: 'db_schema' | 'db_probe',
) => {
	const registrations = buildDatabaseSchemaToolRegistrations(options);
	const target = registrations.find((r) => r.id === toolId);
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

const call = async (handler: (a: unknown) => Promise<unknown>): Promise<ToolBody> => {
	const res = (await handler({})) as ToolBody;
	return res;
};

const fakeDriver = buildFakeDriver(SAMPLE_FIXTURE);

const baseOptions: IDatabaseSchemaToolOptions = {
	namespacePrefix: 'database',
	resolveDsn: () => 'file:./app.db',
	createDriver: async (_dsn: string): Promise<CreateSqliteDriverResult> => ({
		ok: true,
		driver: fakeDriver,
	}),
};

describe('f00128 S1 db-schema tool', () => {
	it('db_probe reports ok when the driver loads', async () => {
		const handler = await captureHandler(baseOptions, 'db_probe');
		const res = await call(handler);
		const body = JSON.parse(res.content[0]?.text ?? '{}') as {
			ok: boolean;
			driver: string;
		};
		expect(body.ok).toBe(true);
		expect(body.driver).toBe('sqlite');
	});

	it('db_probe surfaces ok=false when DATABASE_URL is unset', async () => {
		const handler = await captureHandler(
			{ ...baseOptions, resolveDsn: () => undefined },
			'db_probe',
		);
		const res = await call(handler);
		const body = JSON.parse(res.content[0]?.text ?? '{}') as {
			ok: boolean;
			hint?: string;
		};
		expect(body.ok).toBe(false);
		expect(body.hint).toMatch(/DATABASE_URL/);
	});

	it('db_schema projects the fixture into the documented shape', async () => {
		const handler = await captureHandler(baseOptions, 'db_schema');
		const res = await call(handler);
		const body = JSON.parse(res.content[0]?.text ?? '{}') as {
			driver: string;
			tables: Array<{ name: string; columns: unknown[]; foreignKeys: unknown[] }>;
		};
		expect(body.driver).toBe('sqlite');
		expect(body.tables.map((t) => t.name).sort()).toEqual(['orders', 'users']);
		const users = body.tables.find((t) => t.name === 'users');
		expect(users?.columns.length).toBe(3);
		const orders = body.tables.find((t) => t.name === 'orders');
		expect(orders?.foreignKeys.length).toBe(1);
	});

	it('db_schema returns an install-required envelope when the driver rejects', async () => {
		const handler = await captureHandler(
			{
				...baseOptions,
				createDriver: async () => ({
					ok: false,
					error: 'install-required',
					driver: 'better-sqlite3',
					hint: 'install better-sqlite3',
				}),
			},
			'db_schema',
		);
		const res = await call(handler);
		const body = JSON.parse(res.content[0]?.text ?? '{}') as {
			ok: boolean;
			error: { reason: string; nextAction?: string };
		};
		expect(body.ok).toBe(false);
		expect(body.error.reason).toBe('install-required');
	});

	it('db_schema propagates driver errors as an introspection-failed envelope and redacts the DSN', async () => {
		const broken: IDatabaseDriver = {
			kind: 'sqlite',
			async listTables() {
				throw new Error('permission denied: postgres://u:p@db/x');
			},
			async listColumns() {
				return [];
			},
			async listIndexes() {
				return [];
			},
			async listForeignKeys() {
				return [];
			},
		};
		const handler = await captureHandler(
			{
				...baseOptions,
				createDriver: async () => ({ ok: true, driver: broken }),
			},
			'db_schema',
		);
		const res = await call(handler);
		const body = JSON.parse(res.content[0]?.text ?? '{}') as {
			ok: boolean;
			error: { reason: string; nextAction?: string };
		};
		expect(body.ok).toBe(false);
		expect(body.error.reason).toBe('introspection-failed');
		// The DSN inside nextAction must be redacted; the test fixture
		// stores it as `postgres://u:p@db/x`.
		expect(body.error.nextAction ?? '').not.toMatch(/postgres:\/\/u:p@db/);
		expect(body.error.nextAction ?? '').toMatch(/postgres:\/\/\*\*\*@db/);
	});
});