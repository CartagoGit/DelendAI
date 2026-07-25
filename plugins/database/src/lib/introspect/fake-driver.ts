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
} from './introspect-engine';

export interface IFakeDatabaseFixture {
	readonly tables: readonly {
		readonly name: string;
		readonly columns: IColumnInfo[];
		readonly indexes?: IIndexInfo[];
		readonly foreignKeys?: IForeignKeyInfo[];
	}[];
}

export const buildFakeDriver = (
	fixture: IFakeDatabaseFixture,
): IDatabaseDriver => {
	const byName = new Map(fixture.tables.map((t) => [t.name, t]));
	return {
		kind: 'sqlite',
		async listTables() {
			return fixture.tables.map((t) => t.name).sort();
		},
		async listColumns(table) {
			const t = byName.get(table);
			if (!t) {
				throw new Error(`fake-driver: unknown table "${table}"`);
			}
			return t.columns;
		},
		async listIndexes(table) {
			return byName.get(table)?.indexes ?? [];
		},
		async listForeignKeys(table) {
			return byName.get(table)?.foreignKeys ?? [];
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
					unique: true,
					defaultValue: null,
				},
				{
					name: 'email',
					type: 'text',
					nullable: false,
					primaryKey: false,
					unique: true,
					defaultValue: null,
				},
				{
					name: 'created_at',
					type: 'datetime',
					nullable: true,
					primaryKey: false,
					unique: false,
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
					unique: true,
					defaultValue: null,
				},
				{
					name: 'user_id',
					type: 'integer',
					nullable: false,
					primaryKey: false,
					unique: false,
					defaultValue: null,
				},
				{
					name: 'total_cents',
					type: 'integer',
					nullable: false,
					primaryKey: false,
					unique: false,
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
