/**
 * f00128 S1 — driver-agnostic schema introspection engine.
 *
 * Pure: no I/O, no driver type baked in. The host injects an
 * `IDatabaseDriver` (sqlite today, postgres/mysql later) and the
 * engine produces the canonical `IDatabaseSchema` projection.
 *
 * Output projection is reused by S2 (query guard) and S3 (ERD), so
 * the three slices stack without reformatting.
 */

export type IDriverKind = 'sqlite' | 'postgres' | 'mysql';

/**
 * Driver seam. A driver only has to expose async iterators; the engine
 * does the projection / parallelisation. New engines (postgres, mysql)
 * can be slotted in without touching the tool layer.
 */
export interface IDatabaseDriver {
	readonly kind: IDriverKind;
	listTables(): Promise<string[]>;
	listColumns(table: string): Promise<IColumnInfo[]>;
	listIndexes(table: string): Promise<IIndexInfo[]>;
	listForeignKeys(table: string): Promise<IForeignKeyInfo[]>;
}

/** Canonical lowercase projection of a column type. */
export type IColumnType =
	| 'integer'
	| 'real'
	| 'text'
	| 'blob'
	| 'boolean'
	| 'datetime'
	| 'json'
	| 'unknown';

export interface IColumnInfo {
	readonly name: string;
	readonly type: IColumnType;
	readonly nullable: boolean;
	readonly primaryKey: boolean;
	readonly defaultValue: string | null;
}

export interface IIndexInfo {
	readonly name: string;
	readonly unique: boolean;
	readonly columns: string[];
}

export interface IForeignKeyInfo {
	readonly name: string;
	readonly fromTable: string;
	readonly fromColumns: string[];
	readonly toTable: string;
	readonly toColumns: string[];
}

export interface ITableInfo {
	readonly name: string;
	readonly schema: string | null;
	readonly columns: IColumnInfo[];
	readonly indexes: IIndexInfo[];
	readonly foreignKeys: IForeignKeyInfo[];
}

export interface IDatabaseSchema {
	readonly driver: IDriverKind;
	readonly tables: ITableInfo[];
}

/** Map the vendor-specific type onto the canonical projection. */
export const normaliseColumnType = (raw: string): IColumnType => {
	const t = raw.trim().toLowerCase();
	if (t.startsWith('int') || t.startsWith('bigint') || t.includes('serial')) {
		return 'integer';
	}
	if (
		t.startsWith('real') ||
		t.startsWith('double') ||
		t.startsWith('float') ||
		t === 'numeric' ||
		t === 'decimal'
	) {
		return 'real';
	}
	if (
		t.startsWith('varchar') ||
		t.startsWith('char') ||
		t.startsWith('text') ||
		t === 'citext'
	) {
		return 'text';
	}
	if (t.startsWith('blob') || t === 'bytea') {
		return 'blob';
	}
	if (t.startsWith('bool')) {
		return 'boolean';
	}
	if (
		t.startsWith('timestamp') ||
		t.startsWith('datetime') ||
		t === 'date'
	) {
		return 'datetime';
	}
	if (t === 'json' || t === 'jsonb') {
		return 'json';
	}
	return 'unknown';
};

/**
 * Redact credentials from any DSN that ends up in an error message.
 * Covers:
 *   - `scheme://user:password@host`     → `scheme://***@host`
 *   - `?password=...` / `&password=...` → `?password=***`
 *
 * Used by every tool that surfaces driver errors so a misconfigured
 * DSN never leaks via the MCP boundary.
 */
export const redactDsn = (message: string): string => {
	return message
		.replace(/([a-z][a-z0-9+.-]*:\/\/)[^@/\s]+@/gi, '$1***@')
		.replace(/((?:\?|&)password=)[^&\s]*/gi, '$1***');
};

/**
 * Run the driver once per table, in parallel, and assemble the
 * canonical `IDatabaseSchema`. Throws on driver errors — the error
 * message is run through `redactDsn` so a misconfigured DSN never
 * leaks out of the engine.
 */
export const buildSchema = async (driver: IDatabaseDriver): Promise<IDatabaseSchema> => {
	let tableNames: string[];
	try {
		tableNames = await driver.listTables();
	} catch (err) {
		throw new Error(redactDsn((err as Error).message));
	}
	const tables: ITableInfo[] = await Promise.all(
		tableNames.map(async (name): Promise<ITableInfo> => {
			try {
				const [columns, indexes, foreignKeys] = await Promise.all([
					driver.listColumns(name),
					driver.listIndexes(name),
					driver.listForeignKeys(name),
				]);
				return { name, schema: null, columns, indexes, foreignKeys };
			} catch (err) {
				throw new Error(redactDsn((err as Error).message));
			}
		}),
	);
	return { driver: driver.kind, tables };
};

/** Convenience: log everything on a single line, used by debug envelopes. */
export const formatSchemaOneLine = (schema: IDatabaseSchema): string =>
	`${schema.driver}:` + schema.tables.map((t) => t.name).join(',');