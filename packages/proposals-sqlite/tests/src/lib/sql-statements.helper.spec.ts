/**
 * sql-statements.helper.spec.ts — a migration runs one statement at a
 * time, so a failing statement throws instead of being skipped.
 */
import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import {
	runSqlScript,
	splitSqlStatements,
} from '../../../src/lib/sql-statements.helper';

describe('splitSqlStatements', () => {
	it('splits on semicolons that end a statement, and only those', () => {
		expect(
			splitSqlStatements(`
				-- a comment; not a statement
				CREATE TABLE t (v TEXT DEFAULT 'a;b', "odd;name" TEXT);
				/* block; comment */
				INSERT INTO t (v) VALUES ('it''s; fine');
			`),
		).toEqual([
			'-- a comment; not a statement\n\t\t\t\tCREATE TABLE t (v TEXT DEFAULT \'a;b\', "odd;name" TEXT)',
			"/* block; comment */\n\t\t\t\tINSERT INTO t (v) VALUES ('it''s; fine')",
		]);
	});

	it('keeps a trigger body, with a CASE inside it, as one statement', () => {
		const statements = splitSqlStatements(`
			CREATE TEMP TRIGGER guard BEFORE UPDATE ON t BEGIN
				SELECT CASE WHEN NEW.v = 'x' THEN RAISE(ABORT, 'no; never') END;
				UPDATE t SET v = v;
			END;
			SELECT 1;
		`);
		expect(statements).toHaveLength(2);
		expect(statements[0]?.endsWith('END')).toBe(true);
	});
});

describe('runSqlScript', () => {
	it('throws on a failing statement where exec would skip it', () => {
		const db = new Database(':memory:');
		db.exec("CREATE TABLE t (v INTEGER); INSERT INTO t VALUES ('abc');");
		expect(() =>
			runSqlScript(
				db,
				'CREATE TABLE t2 (v INTEGER) STRICT; INSERT INTO t2 SELECT v FROM t; DROP TABLE t;',
			),
		).toThrow(/cannot store TEXT value in INTEGER column/u);
		// The table after the failing statement was never dropped.
		expect(db.query('SELECT v FROM t').get()).toEqual({ v: 'abc' });
	});
});
