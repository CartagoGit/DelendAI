/**
 * load-database-class.spec.ts — the one loader opens a database on the
 * runtime it runs on.
 */
import { describe, expect, it } from 'bun:test';

import { loadDatabaseClass } from '../../../src/lib/load-database-class';

describe('loadDatabaseClass', () => {
	it('gives a Database that opens, writes and reads', () => {
		const Database = loadDatabaseClass('this spec');
		const db = new Database(':memory:');
		db.exec('CREATE TABLE t (v TEXT)');
		db.query('INSERT INTO t (v) VALUES (?)').run('kept');
		expect(db.query('SELECT v FROM t').get()).toEqual({ v: 'kept' });
		db.close();
	});

	it('is the same constructor every time it is asked', () => {
		expect(loadDatabaseClass('a')).toBe(loadDatabaseClass('b'));
	});
});
