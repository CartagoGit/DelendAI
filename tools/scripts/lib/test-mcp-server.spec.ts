import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import { captureToolRegistration } from './test-mcp-server';

const makeTool = (
	id: string,
	handler: (a: unknown) => Promise<unknown>,
	schemas: {
		inputSchema?: z.ZodTypeAny;
		outputSchema?: z.ZodTypeAny;
	} = {},
): IToolRegistration =>
	({
		id,
		summary: '',
		effects: [],
		tags: [],
		register: async (server: unknown) => {
			(
				server as {
					registerTool: (
						name: string,
						schema: unknown,
						h: (a: unknown) => Promise<unknown>,
					) => void;
				}
			).registerTool(
				`${id}_tool`,
				{
					...(schemas.inputSchema !== undefined
						? { inputSchema: schemas.inputSchema }
						: {}),
					...(schemas.outputSchema !== undefined
						? { outputSchema: schemas.outputSchema }
						: {}),
				},
				handler,
			);
		},
	}) as unknown as IToolRegistration;

describe('captureToolRegistration (Solid DRY + DIP extraction)', async () => {
	it('captures input + output schemas and the invoke closure', async () => {
		const inputSchema = z.object({ name: z.string() });
		const outputSchema = z.object({ greeting: z.string() });
		const tool = makeTool(
			'hi',
			async (a) => ({ greeting: `hi ${(a as { name: string }).name}` }),
			{ inputSchema, outputSchema },
		);
		const captured = await captureToolRegistration(tool);
		expect(captured.inputSchema).toBe(inputSchema);
		expect(captured.outputSchema).toBe(outputSchema);
		expect(captured.tool.id).toBe('hi');
	});

	it('invoke parses the JSON content payload', async () => {
		const tool = makeTool('t', async () => ({ ok: true, n: 7 }));
		const captured = await captureToolRegistration(tool);
		const out = await captured.invoke({});
		expect(out).toEqual({ ok: true, n: 7 });
	});

	it('invoke falls back to raw text when the payload is not JSON', async () => {
		const tool = makeTool('t', async () => ({
			content: [{ type: 'text', text: 'plain text not json' }],
		}));
		const captured = await captureToolRegistration(tool);
		const out = await captured.invoke({});
		expect(out).toBe('plain text not json');
	});

	it('throws when the tool never registered a handler', async () => {
		const noOp: IToolRegistration = {
			id: 'noop',
			summary: '',
			effects: [],
			tags: [],
			register: async () => {},
		} as unknown as IToolRegistration;
		await expect(captureToolRegistration(noOp)).rejects.toThrow(
			/did not register a handler/,
		);
	});

	it('leaves inputSchema/outputSchema undefined when the tool omits them', async () => {
		const tool = makeTool('bare', async () => ({ ok: true }));
		const captured = await captureToolRegistration(tool);
		expect(captured.inputSchema).toBeUndefined();
		expect(captured.outputSchema).toBeUndefined();
	});

	it('LSP: the returned handle satisfies IToolHandle (capture by either interface)', async () => {
		// Solid-LSP guard: the helper's return type is assignable to
		// any consumer-typed handle, regardless of which shape the
		// consumer uses.
		interface IConsumerHandle {
			readonly tool: IToolRegistration;
			readonly inputSchema: z.ZodTypeAny | undefined;
			readonly outputSchema: z.ZodTypeAny | undefined;
			readonly invoke: (args: unknown) => Promise<unknown>;
		}
		const tool = makeTool('t', async () => ({ ok: true }));
		const captured = await captureToolRegistration(tool);
		const asConsumer: IConsumerHandle = captured;
		expect(asConsumer.tool.id).toBe('t');
	});
});
