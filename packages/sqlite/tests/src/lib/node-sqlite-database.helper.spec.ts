/**
 * node-sqlite-database.helper.spec.ts — the Node adapter behaves like the
 * part of `bun:sqlite`'s `Database` the proposals stack relies on.
 * (Bun also provides `node:sqlite`, so this runs in the bun suite.)
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'bun:test';

import { NodeSqliteDatabase } from '../../../src/lib/node-sqlite-database.helper';

const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const withTable = (): NodeSqliteDatabase => {
	const db = new NodeSqliteDatabase(':memory:');
	db.exec(
		'CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT NOT NULL)',
	);
	return db;
};

const countOf = (db: NodeSqliteDatabase): unknown =>
	db.query('SELECT count(*) AS n FROM t').get();

describe('NodeSqliteDatabase', () => {
	it('answers null for no row, numbers from run, rows and arrays from all and values', () => {
		const db = withTable();
		expect(db.query('SELECT v FROM t WHERE id = ?').get(1)).toBeNull();
		expect(db.prepare('INSERT INTO t (v) VALUES (?)').run('a')).toEqual({
			changes: 1,
			lastInsertRowid: 1,
		});
		db.run('INSERT INTO t (v) VALUES (?)', 'b');
		expect(db.query('SELECT v FROM t ORDER BY id').all()).toEqual([
			{ v: 'a' },
			{ v: 'b' },
		]);
		expect(db.query('SELECT id, v FROM t ORDER BY id').values()).toEqual([
			[1, 'a'],
			[2, 'b'],
		]);
		expect(db.query('SELECT 1')).toBe(db.query('SELECT 1'));
		db.close();
	});

	it('commits a transaction, and rolls it back whole when it throws', () => {
		const db = withTable();
		const insert = db.transaction((values: readonly string[]) => {
			for (const value of values)
				db.run('INSERT INTO t (v) VALUES (?)', value);
		});
		insert.immediate(['a', 'b']);
		expect(countOf(db)).toEqual({ n: 2 });

		expect(() =>
			db.transaction(() => {
				db.run('INSERT INTO t (v) VALUES (?)', 'c');
				throw new Error('refused');
			})(),
		).toThrow('refused');
		expect(countOf(db)).toEqual({ n: 2 });
		db.close();
	});

	it('runs a transaction opened inside another as a savepoint', () => {
		const db = withTable();
		db.transaction(() => {
			db.run('INSERT INTO t (v) VALUES (?)', 'outer');
			expect(() =>
				db.transaction(() => {
					db.run('INSERT INTO t (v) VALUES (?)', 'inner');
					throw new Error('inner refused');
				})(),
			).toThrow('inner refused');
		}).immediate();
		expect(db.query('SELECT v FROM t').all()).toEqual([{ v: 'outer' }]);
		db.close();
	});

	it('refuses a missing file when it may not create one, and writes to a read-only one', () => {
		const dir = mkdtempSync(join(tmpdir(), 'node-sqlite-'));
		dirs.push(dir);
		const path = join(dir, 'db.sqlite');
		expect(() => new NodeSqliteDatabase(path, { create: false })).toThrow(
			'unable to open database file',
		);

		const writable = new NodeSqliteDatabase(path);
		writable.exec('CREATE TABLE t (v TEXT)');
		writable.close();
		const readonly = new NodeSqliteDatabase(path, { readonly: true });
		expect(() => readonly.exec("INSERT INTO t (v) VALUES ('x')")).toThrow();
		readonly.close();
	});
});
