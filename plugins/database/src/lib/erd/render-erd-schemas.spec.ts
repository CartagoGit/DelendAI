/**
 * render-erd-schemas.spec.ts — a table keeps its schema, and two tables of
 * the same name in two schemas are two entities with their own keys.
 */
import { describe, expect, it } from 'vitest';

import { buildFakeDriver } from '../introspect/fake-driver';
import { buildSchema } from '../introspect/introspect-engine';
import { renderErd } from './render-erd';

const id = {
	name: 'id',
	type: 'integer' as const,
	nullable: false,
	primaryKey: true,
	defaultValue: null,
};

describe('schemas in the introspected graph', () => {
	it('keeps homonymous tables of two schemas apart, with their own relations', async () => {
		const schema = await buildSchema(
			buildFakeDriver({
				tables: [
					{ name: 'users', schema: 'main', columns: [id] },
					{ name: 'users', schema: 'archive', columns: [id] },
					{
						name: 'orders',
						schema: 'archive',
						columns: [id],
						foreignKeys: [
							{
								name: 'fk_orders_users',
								fromTable: 'orders',
								fromColumns: ['id'],
								toTable: 'users',
								toColumns: ['id'],
							},
						],
					},
				],
			}),
		);
		expect(
			schema.tables.map((table) => `${table.schema}.${table.name}`),
		).toEqual(['archive.orders', 'archive.users', 'main.users']);
		const erd = renderErd(schema);
		expect(erd).toContain('MainUsers {');
		expect(erd).toContain('ArchiveUsers {');
		// The key resolves in its own schema, not to main.users.
		expect(erd).toContain('Orders ||--o{ ArchiveUsers : "fk_orders_users"');
	});

	it('names a table plainly when no other schema shares its name', async () => {
		const schema = await buildSchema(
			buildFakeDriver({
				tables: [{ name: 'users', schema: 'main', columns: [id] }],
			}),
		);
		expect(renderErd(schema)).toContain('Users {');
		expect(renderErd(schema)).not.toContain('MainUsers');
	});
});
