/**
 * f00128 S1 — In-memory fake driver for tests.
 *
 * Mirrors the surface a real `IDatabaseDriver` exposes but uses plain
 * data so unit tests stay hermetic. The shape is a tiny fixture
 * (two tables, one FK) — enough to exercise every code path in
 * `introspect-engine` and `db-schema.tool`.
 */
import type {
	IColumnInfo,
	IDatabaseDriver,
	IIndexInfo,
	IForeignKeyInfo,
	ITableRef,
} from './introspect-engine';

export interface IFakeDatabaseFixture {
	readonly tables: readonly {
		readonly name: string;
		/** Defaults to `null`: one unnamed namespace. */
		readonly schema?: string | null;
		readonly columns: IColumnInfo[];
		readonly indexes?: IIndexInfo[];
		readonly foreignKeys?: IForeignKeyInfo[];
	}[];
}

export const buildFakeDriver = (
	fixture: IFakeDatabaseFixture,
): IDatabaseDriver => {
	const keyOf = (table: ITableRef): string =>
		`${table.schema ?? ''}\u0000${table.name}`;
	const byKey = new Map(
		fixture.tables.map((t) => [
			keyOf({ name: t.name, schema: t.schema ?? null }),
			t,
		]),
	);
	return {
		kind: 'sqlite',
		async listTables() {
			return fixture.tables
				.map(
					(t): ITableRef => ({
						name: t.name,
						schema: t.schema ?? null,
					}),
				)
				.sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
		},
		async listColumns(table) {
			const t = byKey.get(keyOf(table));
			if (!t) {
				throw new Error(`fake-driver: unknown table "${table.name}"`);
			}
			return t.columns;
		},
		async listIndexes(table) {
			return byKey.get(keyOf(table))?.indexes ?? [];
		},
		async listForeignKeys(table) {
			return byKey.get(keyOf(table))?.foreignKeys ?? [];
		},
	};
};

/** Canonical fixture used by `db-schema.tool.spec.ts`. */
export const SAMPLE_FIXTURE: IFakeDatabaseFixture = {
	tables: [
		{
			name: 'users',
			columns: [
				{
					name: 'id',
					type: 'integer',
					nullable: false,
					primaryKey: true,
					defaultValue: null,
				},
				{
					name: 'email',
					type: 'text',
					nullable: false,
					primaryKey: false,
					defaultValue: null,
				},
				{
					name: 'created_at',
					type: 'datetime',
					nullable: true,
					primaryKey: false,
					defaultValue: 'CURRENT_TIMESTAMP',
				},
			],
			indexes: [
				{
					name: 'sqlite_autoindex_users_1',
					unique: true,
					columns: ['email'],
				},
			],
		},
		{
			name: 'orders',
			columns: [
				{
					name: 'id',
					type: 'integer',
					nullable: false,
					primaryKey: true,
					defaultValue: null,
				},
				{
					name: 'user_id',
					type: 'integer',
					nullable: false,
					primaryKey: false,
					defaultValue: null,
				},
				{
					name: 'total_cents',
					type: 'integer',
					nullable: false,
					primaryKey: false,
					defaultValue: '0',
				},
			],
			indexes: [
				{
					name: 'orders_user_id_idx',
					unique: false,
					columns: ['user_id'],
				},
			],
			foreignKeys: [
				{
					name: 'fk_orders_user',
					fromTable: 'orders',
					fromColumns: ['user_id'],
					toTable: 'users',
					toColumns: ['id'],
				},
			],
		},
	],
};
