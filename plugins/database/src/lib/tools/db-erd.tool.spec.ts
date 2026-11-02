import { describe, expect, it } from 'vitest';

import {
	buildDatabaseErdToolRegistrations,
	type IDatabaseErdToolOptions,
} from './db-erd.tool';
import { buildFakeDriver, SAMPLE_FIXTURE } from '../introspect/fake-driver';
import type { CreateSqliteDriverResult } from '../introspect/sqlite-driver';

type ToolBody = {
	content: Array<{ text: string }>;
};

const captureHandler = async (options: IDatabaseErdToolOptions) => {
	const registrations = buildDatabaseErdToolRegistrations(options);
	const target = registrations.find(
		(registration) => registration.id === 'db_erd',
	);
	if (!target) {
		throw new Error('unknown tool id db_erd');
	}
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
	if (!captured) {
		throw new Error('handler not registered');
	}
	return captured;
};

const call = async (
	handler: (args: unknown) => Promise<unknown>,
	args: unknown,
) => {
	const res = (await handler(args)) as ToolBody;
	return JSON.parse(res.content[0]?.text ?? '{}') as {
		mermaid: string;
		tableCount: number;
		relationshipCount: number;
		summary: { tables: number; relationships: number };
	};
};

const baseOptions: IDatabaseErdToolOptions = {
	namespacePrefix: 'database',
	resolveDsn: () => 'file:./app.db',
	createDriver: async (): Promise<CreateSqliteDriverResult> => ({
		ok: true,
		driver: buildFakeDriver(SAMPLE_FIXTURE),
	}),
};

describe('f00128 S3 db-erd tool', () => {
	it('returns mermaid plus table and relationship counts', async () => {
		const handler = await captureHandler(baseOptions);
		const body = await call(handler, {});
		expect(body.tableCount).toBe(2);
		expect(body.relationshipCount).toBe(1);
		expect(body.summary).toEqual({ tables: 2, relationships: 1 });
		expect(body.mermaid).toContain('erDiagram');
		expect(body.mermaid).toContain(
			'users ||--|{ orders : "fk_orders_user"',
		);
	});

	it('filters entities and relationships when tables are requested', async () => {
		const handler = await captureHandler(baseOptions);
		const body = await call(handler, { tables: ['users'] });
		expect(body.tableCount).toBe(1);
		expect(body.relationshipCount).toBe(0);
		expect(body.mermaid).toContain('    users {');
		expect(body.mermaid).not.toContain('fk_orders_user');
	});
});
