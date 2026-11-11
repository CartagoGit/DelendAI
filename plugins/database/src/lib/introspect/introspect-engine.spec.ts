/**
 * f00128 S1 — introspect-engine unit tests.
 *
 * Pure: the engine has no I/O. Coverage:
 * - normaliseColumnType maps the common SQL types onto the canonical
 *   `IColumnType` projection.
 * - redactDsn strips `user:pwd@` and `password=` segments out of any
 *   error message so credentials never leak out of the engine.
 * - buildSchema runs the driver once per table, parallelises
 *   columns / indexes / foreign keys, and produces the
 *   `IDatabaseSchema` projection.
 */
import { describe, expect, it } from 'vitest';

import {
	buildSchema,
	normaliseColumnType,
	redactDsn,
	type IDatabaseDriver,
} from './introspect-engine';
import { buildFakeDriver, SAMPLE_FIXTURE } from './fake-driver';

describe('f00128 S1 introspect-engine', () => {
	describe('normaliseColumnType', () => {
		it.each([
			['INTEGER', 'integer'],
			['bigint', 'integer'],
			['VARCHAR(255)', 'text'],
			['TEXT', 'text'],
			['DOUBLE PRECISION', 'real'],
			['FLOAT', 'real'],
			['BLOB', 'blob'],
			['BYTEA', 'blob'],
			['BOOLEAN', 'boolean'],
			['TIMESTAMP', 'datetime'],
			['DATETIME', 'datetime'],
			['DATE', 'datetime'],
			['JSON', 'json'],
			['JSONB', 'json'],
			['unknown weird type', 'unknown'],
			['', 'unknown'],
		])('maps %s → %s', (raw, expected) => {
			expect(normaliseColumnType(raw)).toBe(expected);
		});
	});

	describe('redactDsn', () => {
		it('strips user:password@ from postgres-style URLs', () => {
			expect(
				redactDsn(
					'failed: connect ECONNREFUSED postgres://app:s3cret@db.local/app',
				),
			).toBe('failed: connect ECONNREFUSED postgres://***@db.local/app');
		});

		it('strips user:password@ from mysql-style URLs', () => {
			expect(redactDsn('mysql://root:hunter2@tcp(127.0.0.1)/foo')).toBe(
				'mysql://***@tcp(127.0.0.1)/foo',
			);
		});

		it('redacts password= query params', () => {
			expect(
				redactDsn('open error: file:./data.db?password=hunter2'),
			).toBe('open error: file:./data.db?password=***');
		});

		it('leaves non-credential messages alone', () => {
			expect(redactDsn('no such table: users')).toBe(
				'no such table: users',
			);
		});

		it('keeps the exact redaction when userinfo and password query are both present', () => {
			expect(
				redactDsn(
					'failed: postgres://app:s3cret@db.local/app?password=hunter2&mode=rw',
				),
			).toBe('failed: postgres://***@db.local/app?password=***&mode=rw');
		});

		it('handles very long credentials without pathological slowdown', () => {
			const secret = 'hunter2'.repeat(20_000);
			const startedAt = performance.now();
			const redacted = redactDsn(
				`failed: postgres://app:${secret}@db.local/app?password=${secret}&mode=rw`,
			);
			expect(redacted).toBe(
				'failed: postgres://***@db.local/app?password=***&mode=rw',
			);
			expect(performance.now() - startedAt).toBeLessThan(1_000);
		});
	});

	describe('buildSchema', () => {
		it('produces a schema for the sample fixture', async () => {
			const driver = buildFakeDriver(SAMPLE_FIXTURE);
			const schema = await buildSchema(driver);
			expect(schema.driver).toBe('sqlite');
			expect(schema.tables.map((t) => t.name).sort()).toEqual([
				'orders',
				'users',
			]);

			const users = schema.tables.find((t) => t.name === 'users');
			expect(users?.columns.map((c) => c.name)).toEqual([
				'id',
				'email',
				'created_at',
			]);
			expect(
				users?.columns.find((c) => c.name === 'id')?.primaryKey,
			).toBe(true);
			expect(
				users?.columns.find((c) => c.name === 'created_at')
					?.defaultValue,
			).toBe('CURRENT_TIMESTAMP');
			expect(users?.indexes).toHaveLength(1);

			const orders = schema.tables.find((t) => t.name === 'orders');
			expect(orders?.foreignKeys).toHaveLength(1);
			expect(orders?.foreignKeys[0]?.toTable).toBe('users');
		});

		it('returns an empty schema when the driver reports no tables', async () => {
			const driver = buildFakeDriver({ tables: [] });
			const schema = await buildSchema(driver);
			expect(schema.tables).toEqual([]);
		});

		it('propagates driver errors so the tool can wrap them', async () => {
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
			await expect(buildSchema(broken)).rejects.toThrow(
				/permission denied.*\*\*\*@/,
			);
		});
	});
});
