import { dsnToPath, type IInstallHint } from '../introspect/sqlite-driver';
import {
	buildExplainSql,
	type IPreparedQuery,
	type IQueryDriver,
} from './query-engine';

interface IBetterSqliteStatement {
	all: (...params: unknown[]) => unknown[];
	run: (...params: unknown[]) => unknown;
}

interface IBetterSqlite {
	prepare: (sql: string) => IBetterSqliteStatement;
	close: () => void;
}

interface IBetterSqliteCtor {
	new (
		path: string,
		options?: {
			readonly readonly?: boolean;
			readonly fileMustExist?: boolean;
		},
	): IBetterSqlite;
}

export interface IQueryDriverOk {
	readonly ok: true;
	readonly driver: IQueryDriver;
}

export type CreateSqliteQueryDriverResult = IQueryDriverOk | IInstallHint;

const tryLoadBetterSqlite = async (): Promise<IBetterSqliteCtor | null> => {
	try {
		const mod = (await import('better-sqlite3')) as {
			default?: IBetterSqliteCtor;
		};
		const ctor = mod.default ?? (mod as unknown as IBetterSqliteCtor);
		return typeof ctor === 'function' ? ctor : null;
	} catch (_err) {
		return null;
	}
};

const rowToPlanLine = (row: unknown): string => {
	if (row === null || typeof row !== 'object') {
		return String(row);
	}
	const record = row as Record<string, unknown>;
	const detail = record.detail;
	if (typeof detail === 'string') {
		return detail;
	}
	return Object.entries(record)
		.map(([key, value]) => `${key}=${String(value)}`)
		.join(' | ');
};

const rowToRecord = (row: unknown): Record<string, unknown> => {
	if (row !== null && typeof row === 'object' && !Array.isArray(row)) {
		return row as Record<string, unknown>;
	}
	return { value: row };
};

const runStatement = (
	db: IBetterSqlite,
	prepared: IPreparedQuery,
	mode: 'all' | 'run',
): readonly Record<string, unknown>[] => {
	const statement = db.prepare(prepared.sql);
	if (mode === 'run') {
		const result = statement.run(...prepared.params);
		return [rowToRecord(result)];
	}
	const rows = statement.all(...prepared.params);
	return rows.map((row) => rowToRecord(row));
};

export const createSqliteQueryDriver = async (
	dsn: string,
): Promise<CreateSqliteQueryDriverResult> => {
	const ctor = await tryLoadBetterSqlite();
	if (!ctor) {
		return {
			ok: false,
			error: 'install-required',
			driver: 'better-sqlite3',
			hint: [
				'The `better-sqlite3` package is not installed.',
				'Install it with: `bun add better-sqlite3`.',
			].join('\n'),
		};
	}
	const path = dsnToPath(dsn);
	const db = new ctor(path);
	// A read runs on a connection opened read-only, opened once it is
	// needed: SQLite itself refuses the write a misread statement attempts.
	let readDb: IBetterSqlite | undefined;
	return {
		ok: true,
		driver: {
			kind: 'sqlite',
			async execute(prepared, options) {
				if (options?.readOnly === true) {
					readDb ??= new ctor(path, {
						readonly: true,
						fileMustExist: true,
					});
					return runStatement(readDb, prepared, 'all');
				}
				const sqlHead = prepared.sql
					.trimStart()
					.slice(0, 6)
					.toLowerCase();
				const mode =
					sqlHead.startsWith('select') ||
					sqlHead.startsWith('pragma') ||
					sqlHead.startsWith('with')
						? 'all'
						: 'run';
				return runStatement(db, prepared, mode);
			},
			async explain(prepared, driver) {
				const sql = buildExplainSql(driver ?? 'sqlite', prepared.sql);
				const rows = db.prepare(sql).all(...prepared.params);
				return rows.map((row) => rowToPlanLine(row));
			},
		},
	};
};
