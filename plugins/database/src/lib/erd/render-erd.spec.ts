import { describe, expect, it } from 'vitest';

import {
	listEntityBlocks,
	renderErd,
	renderErdIntegrity,
	safeEntityName,
} from './render-erd';
import type {
	IDatabaseSchema,
	ITableInfo,
} from '../introspect/introspect-engine';

const table = (
	overrides: Partial<ITableInfo> & { name: string },
): ITableInfo => ({
	schema: null,
	columns: [],
	indexes: [],
	foreignKeys: [],
	...overrides,
});

const fixture: IDatabaseSchema = {
	driver: 'sqlite',
	tables: [
		table({
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
					nullable: false,
					primaryKey: false,
					defaultValue: null,
				},
			],
		}),
		table({
			name: 'posts',
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
					name: 'title',
					type: 'text',
					nullable: true,
					primaryKey: false,
					defaultValue: null,
				},
			],
			foreignKeys: [
				{
					name: 'posts_user_id_fk',
					fromTable: 'posts',
					fromColumns: ['user_id'],
					toTable: 'users',
					toColumns: ['id'],
				},
			],
		}),
		table({
			name: 'order items',
			columns: [
				{
					name: 'id',
					type: 'integer',
					nullable: false,
					primaryKey: true,
					defaultValue: null,
				},
				{
					name: 'userId',
					type: 'integer',
					nullable: false,
					primaryKey: false,
					defaultValue: null,
				},
			],
			foreignKeys: [
				{
					name: 'order_items_user_fk',
					fromTable: 'order items',
					fromColumns: ['userId'],
					toTable: 'users',
					toColumns: ['id'],
				},
			],
		}),
	],
};

describe('safeEntityName', () => {
	it('PascalCases snake_case names', () => {
		expect(safeEntityName('user_profile')).toBe('UserProfile');
	});
	it('PascalCases camelCase names', () => {
		expect(safeEntityName('userProfile')).toBe('UserProfile');
	});
	it('handles spaces and special characters', () => {
		expect(safeEntityName('order items')).toBe('OrderItems');
	});
	it('handles numbers at the start', () => {
		// digit-token stays as-is, alpha token gets PascalCased.
		expect(safeEntityName('2024_logs')).toBe('T_2024Logs');
	});
	it('returns T_<name> when the cleaned name starts with a digit', () => {
		expect(safeEntityName('1foo')).toBe('T_1foo');
	});
	it('suffixes reserved Mermaid keywords', () => {
		expect(safeEntityName('end')).toBe('end_');
		expect(safeEntityName('one')).toBe('one_');
	});
});

describe('renderErd', () => {
	it('starts with the erDiagram header', () => {
		expect(renderErd(fixture).split('\n')[0]).toBe('erDiagram');
	});

	it('emits one entity block per table', () => {
		const out = renderErd(fixture);
		expect(out).toContain('Users {');
		expect(out).toContain('Posts {');
		expect(out).toContain('OrderItems {');
	});

	it('marks primary keys', () => {
		const out = renderErd(fixture);
		expect(out).toContain('int id PK');
	});

	it('emits a relationship line for every foreign key', () => {
		const out = renderErd(fixture);
		expect(out).toContain('Posts ||--o{ Users : "posts_user_id_fk"');
		expect(out).toContain(
			'OrderItems ||--o{ Users : "order_items_user_fk"',
		);
	});

	it('handles a schema with no foreign keys', () => {
		const schema: IDatabaseSchema = {
			driver: 'sqlite',
			tables: [
				table({
					name: 'a',
					columns: [
						{
							name: 'id',
							type: 'integer',
							nullable: false,
							primaryKey: true,
							defaultValue: null,
						},
					],
				}),
				table({
					name: 'b',
					columns: [
						{
							name: 'id',
							type: 'integer',
							nullable: false,
							primaryKey: true,
							defaultValue: null,
						},
					],
				}),
			],
		};
		const out = renderErd(schema);
		expect(out).toContain('A {');
		expect(out).toContain('B {');
		// No relationship lines in the body.
		expect(out.split('\n').filter((l) => l.includes('||--o{')).length).toBe(
			0,
		);
	});

	it('skips foreign keys that point at tables outside the schema', () => {
		const schema: IDatabaseSchema = {
			driver: 'sqlite',
			tables: [
				table({
					name: 'users',
					columns: [
						{
							name: 'id',
							type: 'integer',
							nullable: false,
							primaryKey: true,
							defaultValue: null,
						},
					],
				}),
				table({
					name: 'sessions',
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
					],
					foreignKeys: [
						{
							name: 'sessions_user_fk',
							fromTable: 'sessions',
							fromColumns: ['user_id'],
							toTable: 'users',
							toColumns: ['id'],
						},
						{
							name: 'sessions_ghost_fk',
							fromTable: 'sessions',
							fromColumns: ['user_id'],
							toTable: 'ghost_table',
							toColumns: ['id'],
						},
					],
				}),
			],
		};
		const out = renderErd(schema);
		expect(out).toContain('"sessions_user_fk"');
		expect(out).not.toContain('"sessions_ghost_fk"');
	});
});

describe('listEntityBlocks', () => {
	it('returns one entry per table with the sanitized entity name', () => {
		const blocks = listEntityBlocks(fixture);
		expect(blocks).toHaveLength(3);
		expect(blocks[0]?.entity).toBe('Users');
		expect(blocks[2]?.entity).toBe('OrderItems');
	});
});

describe('renderErdIntegrity', () => {
	it('returns true when every table and FK is rendered', () => {
		expect(renderErdIntegrity(fixture)).toBe(true);
	});
});
