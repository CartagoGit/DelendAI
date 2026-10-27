/**
 * sqlite-driver-schemas.spec.ts — the SQLite driver lists the tables of
 * every attached database with their schema, and reads each in its own.
 */
import { describe, expect, it } from 'vitest';

import type {
	IBetterSqlite,
	IBetterSqliteCtor,
} from '../contracts/interfaces/sqlite-binding.interface';
import { buildSchema } from './introspect-engine';
import { createSqliteDriver } from './sqlite-driver';

/** Answers what the driver asks, per SQL text, from two databases. */
const answers: Readonly<Record<string, unknown[]>> = {
	'PRAGMA database_list': [
		{ name: 'main' },
		{ name: 'temp' },
		{ name: 'archive' },
	],
	[`SELECT name FROM "main".sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`]:
		[{ name: 'users' }],
	[`SELECT name FROM "archive".sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`]:
		[{ name: 'orders' }, { name: 'users' }],
	'PRAGMA "main".table_info("users")': [
		{ name: 'id', type: 'INTEGER', notnull: 1, pk: 1, dflt_value: null },
	],
	'PRAGMA "archive".table_info("users")': [
		{ name: 'id', type: 'INTEGER', notnull: 1, pk: 1, dflt_value: null },
		{
			name: 'archived_at',
			type: 'TEXT',
			notnull: 0,
			pk: 0,
			dflt_value: null,
		},
	],
	'PRAGMA "archive".table_info("orders")': [
		{
			name: 'user_id',
			type: 'INTEGER',
			notnull: 1,
			pk: 0,
			dflt_value: null,
		},
	],
	'PRAGMA "archive".foreign_key_list("orders")': [
		{ id: 0, from: 'user_id', table: 'users', to: 'id' },
	],
};

const asked: string[] = [];
class FakeDatabase implements IBetterSqlite {
	prepare(sql: string) {
		asked.push(sql);
		return {
			all: () => answers[sql] ?? [],
			iterate: () => answers[sql] ?? [],
		};
	}
	close() {}
}
const load = async (): Promise<IBetterSqliteCtor> => FakeDatabase;

describe('createSqliteDriver', () => {
	it('names every table with the database that holds it', async () => {
		const created = await createSqliteDriver('file:app.db', load);
		if (!created.ok) throw new Error(created.hint);
		const schema = await buildSchema(created.driver);
		expect(schema.tables.map((t) => `${t.schema}.${t.name}`)).toEqual([
			'main.users',
			'archive.orders',
			'archive.users',
		]);
		expect(
			schema.tables
				.find((t) => t.schema === 'archive' && t.name === 'users')
				?.columns.map((c) => c.name),
		).toEqual(['id', 'archived_at']);
		expect(
			schema.tables.find((t) => t.name === 'orders')?.foreignKeys[0],
		).toMatchObject({ toTable: 'users', toSchema: 'archive' });
		expect(asked).not.toContain(
			`SELECT name FROM "temp".sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
		);
	});

	it('returns the install hint when the binding is missing', async () => {
		const created = await createSqliteDriver('app.db', async () => null);
		expect(created).toMatchObject({ ok: false, error: 'install-required' });
	});
});
