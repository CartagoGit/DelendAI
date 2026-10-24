import { describe, expect, it } from 'vitest';

import type {
	IHarvestedTool,
	IJsonSchemaNode,
} from '../types/emit-tool-types.script';
import { compactListFindings, newFindings } from './compact-list-tools.script';

const fields = (count: number): Record<string, IJsonSchemaNode> =>
	Object.fromEntries(
		Array.from({ length: count }, (_, index) => [
			`field${String(index)}`,
			{ type: 'string' },
		]),
	);

const listing = (
	name: string,
	itemFields: Record<string, IJsonSchemaNode>,
	input?: Record<string, IJsonSchemaNode>,
): IHarvestedTool => ({
	name,
	schema: {
		type: 'object',
		properties: {
			page: {
				type: 'object',
				properties: {
					items: {
						type: 'array',
						items: { type: 'object', properties: itemFields },
					},
				},
			},
		},
	},
	...(input === undefined
		? {}
		: { input: { type: 'object', properties: input } }),
});

describe('compactListFindings', () => {
	it('finds a list of full items, however deep, in a tool without a detail input', () => {
		expect(compactListFindings([listing('full', fields(6))])).toEqual([
			{ tool: 'full', path: 'page.items', fields: 6 },
		]);
	});

	it('accepts entries of five fields, entries with a detailsId, and tools that take an id or detail', () => {
		expect(
			compactListFindings([
				listing('brief', fields(5)),
				listing('addressable', {
					...fields(8),
					detailsId: { type: 'string' },
				}),
				listing('by-id', fields(8), { proposalId: { type: 'string' } }),
				listing('by-snake-id', fields(8), {
					task_id: { type: 'string' },
				}),
				listing('detail', fields(8), { detail: { type: 'boolean' } }),
			]),
		).toEqual([]);
	});

	it('reads the variants of a union output', () => {
		const tool: IHarvestedTool = {
			name: 'union',
			schema: {
				anyOf: [
					{
						type: 'object',
						properties: { error: { type: 'string' } },
					},
					{
						type: 'object',
						properties: {
							rows: {
								type: 'array',
								items: {
									type: 'object',
									properties: fields(7),
								},
							},
						},
					},
				],
			},
		};
		expect(compactListFindings([tool])).toEqual([
			{ tool: 'union', path: 'rows', fields: 7 },
		]);
	});
});

describe('newFindings', () => {
	it('keeps only the tools the baseline does not name', () => {
		const findings = compactListFindings([
			listing('old', fields(6)),
			listing('new', fields(6)),
		]);
		expect(newFindings(findings, ['old']).map((f) => f.tool)).toEqual([
			'new',
		]);
	});
});
