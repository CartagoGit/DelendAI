import { describe, expect, it } from 'vitest';

import {
	buildSchema,
	type IDatabaseSchema,
	type ITableInfo,
} from '../introspect/introspect-engine';
import { buildFakeDriver, SAMPLE_FIXTURE } from '../introspect/fake-driver';
import {
	buildMermaidEr,
	classifyForeignKeyRelationship,
	countRelationships,
	filterSchemaTables,
} from './build-mermaid-er';

const buildFixtureSchema = async (): Promise<IDatabaseSchema> =>
	buildSchema(buildFakeDriver(SAMPLE_FIXTURE));

describe('f00128 S3 build-mermaid-er', () => {
	it('emits erDiagram, a known table, and a known relationship from the fixture', async () => {
		const schema = await buildFixtureSchema();
		const mermaid = buildMermaidEr(schema);
		expect(mermaid.startsWith('erDiagram\n')).toBe(true);
		expect(mermaid).toContain('    orders {');
		expect(mermaid).toContain('        integer user_id FK');
		expect(mermaid).toContain('    users ||--|{ orders : "fk_orders_user"');
	});

	it('returns an erDiagram block for an empty schema', () => {
		const mermaid = buildMermaidEr({ driver: 'sqlite', tables: [] });
		expect(mermaid).toBe('erDiagram\n');
	});

	it('classifies one-to-one, one-to-many, and many-to-many from FK shape', () => {
		const oneToOneTable: ITableInfo = {
			name: 'profiles',
			schema: null,
			columns: [
				{
					name: 'user_id',
					type: 'integer',
					nullable: false,
					primaryKey: false,
					unique: false,
					defaultValue: null,
				},
			],
			indexes: [
				{
					name: 'profiles_user_id_key',
					unique: true,
					columns: ['user_id'],
				},
			],
			foreignKeys: [
				{
					name: 'fk_profiles_user',
					fromTable: 'profiles',
					fromColumns: ['user_id'],
					toTable: 'users',
					toColumns: ['id'],
				},
			],
		};

		const oneToManyTable: ITableInfo = {
			name: 'orders',
			schema: null,
			columns: [
				{
					name: 'user_id',
					type: 'integer',
					nullable: false,
					primaryKey: false,
					unique: false,
					defaultValue: null,
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
		};

		const manyToManyTable: ITableInfo = {
			name: 'authors_books',
			schema: null,
			columns: [
				{
					name: 'author_id',
					type: 'integer',
					nullable: false,
					primaryKey: true,
					unique: true,
					defaultValue: null,
				},
				{
					name: 'book_id',
					type: 'integer',
					nullable: false,
					primaryKey: true,
					unique: true,
					defaultValue: null,
				},
			],
			indexes: [],
			foreignKeys: [
				{
					name: 'fk_authors_books_author',
					fromTable: 'authors_books',
					fromColumns: ['author_id'],
					toTable: 'authors',
					toColumns: ['id'],
				},
				{
					name: 'fk_authors_books_book',
					fromTable: 'authors_books',
					fromColumns: ['book_id'],
					toTable: 'books',
					toColumns: ['id'],
				},
			],
		};

		const oneToOneForeignKey = oneToOneTable.foreignKeys[0];
		const oneToManyForeignKey = oneToManyTable.foreignKeys[0];
		const manyToManyForeignKey = manyToManyTable.foreignKeys[0];
		if (
			oneToOneForeignKey === undefined ||
			oneToManyForeignKey === undefined ||
			manyToManyForeignKey === undefined
		) {
			throw new Error('expected FK fixtures to be present');
		}

		expect(
			classifyForeignKeyRelationship(
				oneToOneTable as ITableInfo,
				oneToOneForeignKey,
			),
		).toBe('one-to-one');
		expect(
			classifyForeignKeyRelationship(
				oneToManyTable as ITableInfo,
				oneToManyForeignKey,
			),
		).toBe('one-to-many');
		expect(
			classifyForeignKeyRelationship(
				manyToManyTable as ITableInfo,
				manyToManyForeignKey,
			),
		).toBe('many-to-many');
	});

	it('filters tables deterministically and counts relationships on the filtered schema', async () => {
		const schema = await buildFixtureSchema();
		const filtered = filterSchemaTables(schema, ['users']);
		expect(filtered.tables.map((table) => table.name)).toEqual(['users']);
		expect(countRelationships(filtered)).toBe(0);
		expect(buildMermaidEr(filtered)).not.toContain('fk_orders_user');
	});
});
