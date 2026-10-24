import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { buildDiagramProposalsToolRegistrations } from '../../../../src/lib/tools/diagram-proposals.tool';

type THandler = (a: unknown) => Promise<{
	content: Array<{ text: string }>;
}>;

interface ICaptured {
	inputSchema: z.ZodTypeAny;
	handler: THandler;
}

const captureErd = async (): Promise<ICaptured> => {
	const registrations = buildDiagramProposalsToolRegistrations({
		namespacePrefix: 'delendai',
	});
	const erd = registrations.find((r) => r.id === 'diagram_erd');
	if (!erd) throw new Error('diagram_erd not registered');
	let inputSchema: z.ZodTypeAny | undefined;
	let handler: THandler | undefined;
	await erd.register({
		registerTool: (
			_name: string,
			schema: { inputSchema?: z.ZodTypeAny },
			fn: THandler,
		): void => {
			inputSchema = schema.inputSchema;
			handler = fn;
		},
	} as never);
	if (!inputSchema || !handler)
		throw new Error('diagram_erd schema/handler missing');
	return { inputSchema, handler };
};

const validSchema = {
	driver: 'sqlite',
	tables: [
		{
			name: 'users',
			schema: null,
			columns: [
				{
					name: 'id',
					type: 'INTEGER',
					nullable: false,
					primaryKey: true,
					defaultValue: null,
				},
			],
			indexes: [],
			foreignKeys: [],
		},
	],
};

describe('diagram_erd — input schema strictness', () => {
	it('rejects non-object schemas at the schema layer (no runtime fallthrough)', async () => {
		const { inputSchema } = await captureErd();
		expect(inputSchema.safeParse({ schema: 123 }).success).toBe(false);
		expect(inputSchema.safeParse({ schema: 'nope' }).success).toBe(false);
		expect(inputSchema.safeParse({ schema: null }).success).toBe(false);
		expect(inputSchema.safeParse({ schema: {} }).success).toBe(false);
	});

	it('rejects tables missing the fields the renderer dereferences', async () => {
		const { inputSchema } = await captureErd();
		expect(
			inputSchema.safeParse({ schema: { tables: [{ name: 'x' }] } })
				.success,
		).toBe(false);
		expect(
			inputSchema.safeParse({
				schema: { tables: [{ name: 'x', columns: [] }] },
			}).success,
		).toBe(false);
	});

	it('accepts a well-formed IDatabaseSchema and renders mermaid', async () => {
		const { inputSchema, handler } = await captureErd();
		expect(inputSchema.safeParse({ schema: validSchema }).success).toBe(
			true,
		);
		const result = await handler({ schema: validSchema });
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.mermaid).toContain('erDiagram');
		expect(body.tables).toBe(1);
		expect(body.relationships).toBe(0);
	});
});
