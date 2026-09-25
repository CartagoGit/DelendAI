/**
 * sql-statements.helper.ts — a migration runs one statement at a time.
 *
 * bun:sqlite's `Database.exec` runs a script of several statements and
 * does NOT throw when one of them fails while running — a STRICT type
 * check, a constraint — it skips that statement and carries on. Measured
 * on bun 1.4.2: `exec("CREATE TABLE t2 … STRICT; INSERT INTO t2 SELECT …;
 * DROP TABLE t; ALTER TABLE t2 RENAME TO t;")` with a value the INSERT
 * refuses returned normally, having dropped the original table and kept
 * the empty copy. A single statement does throw. So a migration is split
 * into its statements and each is run on its own: the first failure
 * throws, and the transaction around the migration rolls all of it back.
 *
 * The split understands what a migration contains: quoted strings and
 * identifiers, `--` and block comments, and trigger bodies, whose
 * `BEGIN … END` (and any `CASE … END` inside) holds semicolons that do
 * not end the statement.
 */

const WORD = /[A-Za-z_]/u;

/** The statements of `sql`, each without its terminating semicolon. */
export const splitSqlStatements = (sql: string): readonly string[] => {
	const statements: string[] = [];
	let start = 0;
	let depth = 0;
	let isTrigger = false;
	let words: string[] = [];
	let index = 0;
	const flush = (end: number): void => {
		const text = sql.slice(start, end).trim();
		if (text.replace(/--[^\n]*|\/\*[\s\S]*?\*\//gu, '').trim() !== '') {
			statements.push(text);
		}
		start = end + 1;
		depth = 0;
		isTrigger = false;
		words = [];
	};
	while (index < sql.length) {
		const char = sql[index] ?? '';
		const next = sql[index + 1] ?? '';
		if (char === '-' && next === '-') {
			const end = sql.indexOf('\n', index);
			index = end === -1 ? sql.length : end + 1;
			continue;
		}
		if (char === '/' && next === '*') {
			const end = sql.indexOf('*/', index + 2);
			index = end === -1 ? sql.length : end + 2;
			continue;
		}
		if (char === "'" || char === '"' || char === '`') {
			let end = index + 1;
			while (end < sql.length) {
				if (sql[end] === char) {
					if (sql[end + 1] === char) {
						end += 2;
						continue;
					}
					break;
				}
				end += 1;
			}
			index = end + 1;
			continue;
		}
		if (WORD.test(char)) {
			let end = index + 1;
			while (end < sql.length && /[A-Za-z0-9_]/u.test(sql[end] ?? ''))
				end += 1;
			const word = sql.slice(index, end).toUpperCase();
			if (words.length < 4) {
				words.push(word);
				if (
					words[0] === 'CREATE' &&
					(words[1] === 'TRIGGER' ||
						((words[1] === 'TEMP' || words[1] === 'TEMPORARY') &&
							words[2] === 'TRIGGER'))
				) {
					isTrigger = true;
				}
			}
			if ((word === 'BEGIN' && isTrigger) || word === 'CASE') depth += 1;
			if (word === 'END' && depth > 0) depth -= 1;
			index = end;
			continue;
		}
		if (char === ';' && depth === 0) {
			flush(index);
		}
		index += 1;
	}
	flush(sql.length);
	return statements;
};

/** Runs every statement of `sql` on its own, so the first failure throws. */
export const runSqlScript = (
	db: { run(sql: string): unknown },
	sql: string,
): void => {
	for (const statement of splitSqlStatements(sql)) db.run(statement);
};
