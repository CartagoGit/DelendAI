import { describe, expect, it } from 'vitest';

import {
	buildExplainSql,
	classifySql,
	executeGuardedQuery,
	explainQuery,
	flattenNamedParams,
	type IPreparedQuery,
	type IQueryDriver,
} from './query-engine';

const createFakeDriver = (overrides?: Partial<IQueryDriver>): IQueryDriver => ({
	kind: 'sqlite',
	async execute(prepared: IPreparedQuery) {
		if (prepared.sql.includes('BROKEN')) {
			throw new Error(
				'open failed: file:/tmp/secret.db?password=hunter2',
			);
		}
		return [{ id: 1, sql: prepared.sql, params: [...prepared.params] }];
	},
	async explain(prepared: IPreparedQuery) {
		return [`SCAN ${prepared.sql}`];
	},
	...overrides,
});

describe('f00128 S2 query engine', () => {
	it('classifies reads, writes and ddl', () => {
		expect(classifySql('select * from users')).toBe('read');
		expect(classifySql('insert into users values (1)')).toBe('write');
		expect(classifySql('create table users(id integer)')).toBe('ddl');
	});

	it('refuses writes by default', async () => {
		const result = await executeGuardedQuery(createFakeDriver(), {
			sql: 'update users set email = ?',
			params: ['x'],
			dryRun: false,
		});
		expect(result).toEqual({
			ok: false,
			error: 'write-refused',
			reason: 'Mutating statements require both allowWrite:true and confirm:true.',
			classification: 'write',
		});
	});

	it('allows writes only with allowWrite and confirm', async () => {
		const result = await executeGuardedQuery(createFakeDriver(), {
			sql: 'update users set email = ?',
			params: ['x'],
			allowWrite: true,
			confirm: true,
			dryRun: false,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error('expected success');
		}
		expect(result.rowCount).toBe(1);
	});

	it('refuses ddl', async () => {
		const result = await executeGuardedQuery(createFakeDriver(), {
			sql: 'drop table users',
			dryRun: false,
		});
		expect(result).toEqual({
			ok: false,
			error: 'ddl-refused',
			reason: 'DDL statements are blocked by default. This tool does not execute schema changes.',
			classification: 'ddl',
		});
	});

	it('redacts DSN text on execution errors', async () => {
		await expect(
			executeGuardedQuery(createFakeDriver(), {
				sql: 'select * from BROKEN',
				dryRun: false,
			}),
		).rejects.toThrow(/file:\/.*password=\*\*\*/i);
		await expect(
			executeGuardedQuery(createFakeDriver(), {
				sql: 'select * from BROKEN',
				dryRun: false,
			}),
		).rejects.not.toThrow(/hunter2/);
	});

	it('flattens named params to positional order', () => {
		const prepared = flattenNamedParams(
			'select * from users where id = :id and email = @email and org = $org',
			{ id: 1, email: 'x@example.com', org: 'acme' },
		);
		expect(prepared.sql).toBe(
			'select * from users where id = ? and email = ? and org = ?',
		);
		expect(prepared.params).toEqual([1, 'x@example.com', 'acme']);
	});

	it('builds explain output for read queries', async () => {
		const result = await explainQuery(createFakeDriver(), {
			sql: 'select * from users',
		});
		expect(result).toEqual({
			ok: true,
			classification: 'read',
			dryRun: true,
			plan: ['SCAN select * from users'],
		});
		expect(buildExplainSql('sqlite', 'select 1')).toBe(
			'EXPLAIN QUERY PLAN select 1',
		);
	});
});
