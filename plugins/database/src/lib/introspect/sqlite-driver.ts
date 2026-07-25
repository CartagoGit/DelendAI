/**
 * f00128 S1 — better-sqlite3 driver factory.
 *
 * `better-sqlite3` is declared as an optional peer dependency. When
 * the package is missing the factory returns a typed
 * `install-required` envelope so the host can show the install hint
 * instead of crashing at boot.
 *
 * DSN format (matches `better-sqlite3`): a `file:` URL or a plain
 * filesystem path. Anything else is a usage error.
 */
import type {
	IColumnInfo,
	IDatabaseDriver,
	IIndexInfo,
	IForeignKeyInfo,
} from './introspect-engine';
import { normaliseColumnType } from './introspect-engine';

export interface IInstallHint {
	readonly ok: false;
	readonly error: 'install-required';
	readonly driver: 'better-sqlite3';
	readonly hint: string;
}

export interface ILoadOk {
	readonly ok: true;
	readonly driver: IDatabaseDriver;
}

export type CreateSqliteDriverResult = IInstallHint | ILoadOk;

interface IBetterSqlite {
	prepare: (sql: string) => {
		all: (...params: unknown[]) => unknown[];
		iterate: (...params: unknown[]) => Iterable<unknown>;
	};
	close: () => void;
}

interface IBetterSqliteCtor {
	new (path: string): IBetterSqlite;
}

/**
 * Strip the `file:` prefix (and any `?mode=...&...` query) that
 * better-sqlite3 does not consume. Anything else is forwarded as-is.
 */
export const dsnToPath = (dsn: string): string => {
	if (dsn.startsWith('file:')) {
		const stripped = dsn.slice('file:'.length);
		const qIdx = stripped.indexOf('?');
		return qIdx === -1 ? stripped : stripped.slice(0, qIdx);
	}
	return dsn;
};

/**
 * Try to load `better-sqlite3` dynamically. Returns `null` when the
 * package is missing — never throws at boot.
 */
const tryLoadBetterSqlite = async (): Promise<IBetterSqliteCtor | null> => {
	try {
		const mod = (await import('better-sqlite3')) as {
			default?: IBetterSqliteCtor;
		};
		const Ctor = mod.default ?? (mod as unknown as IBetterSqliteCtor);
		return typeof Ctor === 'function' ? Ctor : null;
	} catch (_err) {
		return null;
	}
};

/** Open a sqlite database at `dsn` and wrap it in an `IDatabaseDriver`. */
export const createSqliteDriver = async (
	dsn: string,
): Promise<CreateSqliteDriverResult> => {
	const Ctor = await tryLoadBetterSqlite();
	if (!Ctor) {
		return {
			ok: false,
			error: 'install-required',
			driver: 'better-sqlite3',
			hint: [
				'The `better-sqlite3` package is not installed.',
				'Install it with: `bun add better-sqlite3`.',
				'The database plugin will load `db_schema` and `db_probe` tools,',
				'but every introspection call will return this envelope until the',
				'native binding is present.',
			].join('\n'),
		};
	}
	const path = dsnToPath(dsn);
	const db = new Ctor(path);
	return {
		ok: true,
		driver: {
			kind: 'sqlite',
			async listTables() {
				const rows = db
					.prepare(
						"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
					)
					.all() as Array<{ name: string }>;
				return rows.map((r) => r.name);
			},
			async listColumns(table) {
				const uniqueColumns = new Set(
					db
						.prepare(`PRAGMA index_list(${quoteIdent(table)})`)
						.all()
						.filter(
							(row) => (row as { unique: 0 | 1 }).unique !== 0,
						)
						.flatMap((row) =>
							db
								.prepare(
									`PRAGMA index_info(${quoteIdent((row as { name: string }).name)})`,
								)
								.all()
								.map(
									(column) =>
										(column as { name: string }).name,
								),
						),
				);
				const rows = db
					.prepare(`PRAGMA table_info(${quoteIdent(table)})`)
					.all() as Array<{
					name: string;
					type: string;
					notnull: 0 | 1;
					pk: 0 | 1;
					dflt_value: unknown;
				}>;
				return rows.map<IColumnInfo>((r) => ({
					name: r.name,
					type: normaliseColumnType(r.type),
					nullable: r.notnull === 0,
					primaryKey: r.pk !== 0,
					unique: r.pk !== 0 || uniqueColumns.has(r.name),
					defaultValue:
						r.dflt_value === null ? null : String(r.dflt_value),
				}));
			},
			async listIndexes(table) {
				const rows = db
					.prepare(`PRAGMA index_list(${quoteIdent(table)})`)
					.all() as Array<{
					name: string;
					unique: 0 | 1;
				}>;
				return rows.map<IIndexInfo>((r) => {
					const cols = db
						.prepare(`PRAGMA index_info(${quoteIdent(r.name)})`)
						.all() as Array<{
						name: string;
					}>;
					return {
						name: r.name,
						unique: r.unique !== 0,
						columns: cols.map((c) => c.name),
					};
				});
			},
			async listForeignKeys(table) {
				const rows = db
					.prepare(`PRAGMA foreign_key_list(${quoteIdent(table)})`)
					.all() as Array<{
					id: number;
					from: string;
					table: string;
					to: string;
				}>;
				// Group by id (PRAGMA emits one row per column).
				const grouped = new Map<number, IForeignKeyInfo>();
				for (const r of rows) {
					const existing = grouped.get(r.id);
					if (existing) {
						grouped.set(r.id, {
							...existing,
							fromColumns: [...existing.fromColumns, r.from],
							toColumns: [...existing.toColumns, r.to],
						});
					} else {
						grouped.set(r.id, {
							name: `fk_${table}_${r.id}`,
							fromTable: table,
							fromColumns: [r.from],
							toTable: r.table,
							toColumns: [r.to],
						});
					}
				}
				return Array.from(grouped.values());
			},
		},
	};
};

/** Quote a sqlite identifier (table or index name). */
const quoteIdent = (name: string): string => {
	if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return `"${name}"`;
	return `"${name.replace(/"/g, '""')}"`;
};
