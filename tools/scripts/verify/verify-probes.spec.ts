import type { z } from 'zod';
import { z as zImpl } from 'zod';
import { describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import {
	HAPPY_PATH_PROBE_IDS,
	KNOWN_PROBE_INPUTS,
	runEmptyInputProbe,
	runHappyPathProbe,
	type IToolHandle,
} from './verify-probes';

/**
 * Solid-ISP test helper: build an `IToolHandle` from a stub schema +
 * a fake handler. No MCP server boot, no fs, no plugin resolution.
 */
const makeHandle = (opts: {
	readonly toolId?: string;
	readonly inputSchema?: z.ZodTypeAny;
	readonly outputSchema?: z.ZodTypeAny;
	readonly handlerResult?: unknown;
	readonly handlerThrows?: boolean;
}): IToolHandle => {
	const tool = {
		id: opts.toolId ?? 'stub_tool',
		summary: '',
		effects: [],
		tags: [],
		register: async () => {},
	} as unknown as IToolRegistration;
	return {
		tool,
		inputSchema: opts.inputSchema,
		outputSchema: opts.outputSchema,
		invoke: async () => {
			if (opts.handlerThrows) throw new Error('handler boom');
			return opts.handlerResult;
		},
	};
};

describe('verify-probes (Solid SRP extraction)', async () => {
	describe('runEmptyInputProbe', async () => {
		it('returns "ok" when inputSchema accepts {} and outputSchema matches', async () => {
			const handle = makeHandle({
				inputSchema: zImpl.object({}).passthrough(),
				outputSchema: zImpl.object({ greeting: zImpl.string() }),
				handlerResult: { greeting: 'hi' },
			});
			const res = await runEmptyInputProbe(handle);
			expect(res.outcome).toBe('ok');
			expect(res.handlerReturned).toBe(true);
			expect(res.detail).toBeUndefined();
		});

		it('returns "needs-input" when inputSchema rejects {}', async () => {
			const handle = makeHandle({
				inputSchema: zImpl.object({ path: zImpl.string() }),
			});
			const res = await runEmptyInputProbe(handle);
			expect(res.outcome).toBe('needs-input');
			expect(res.handlerReturned).toBe(true);
			expect(res.detail).toMatch(/path/);
		});

		it('returns "failed" when handler throws on schema-accepted input', async () => {
			const handle = makeHandle({
				inputSchema: zImpl.object({}).passthrough(),
				outputSchema: zImpl.object({ ok: zImpl.boolean() }),
				handlerThrows: true,
			});
			const res = await runEmptyInputProbe(handle);
			expect(res.outcome).toBe('failed');
			expect(res.handlerReturned).toBe(true);
			expect(res.detail).toContain('handler boom');
		});

		it('returns "failed" when handler returns output that violates outputSchema', async () => {
			const handle = makeHandle({
				inputSchema: zImpl.object({}).passthrough(),
				outputSchema: zImpl.object({ greeting: zImpl.string() }),
				handlerResult: { greeting: 42 }, // wrong type
			});
			const res = await runEmptyInputProbe(handle);
			expect(res.outcome).toBe('failed');
		});

		it('treats the documented catchall (no outputSchema) as ok when handler returns', async () => {
			// AGENTS.md #8: open catchall is a documented exception.
			const handle = makeHandle({
				inputSchema: zImpl.object({}).passthrough(),
				handlerResult: { whatever: 'works' },
			});
			const res = await runEmptyInputProbe(handle);
			expect(res.outcome).toBe('ok');
		});

		it('works with no inputSchema at all (empty input is trivially accepted)', async () => {
			const handle = makeHandle({
				handlerResult: {},
			});
			const res = await runEmptyInputProbe(handle);
			expect(res.outcome).toBe('ok');
		});
	});

	describe('runHappyPathProbe', async () => {
		it('returns null when KNOWN_PROBE_INPUTS has no entry for the tool id', async () => {
			const handle = makeHandle({
				toolId: 'totally_unknown_tool',
				inputSchema: zImpl.object({}).passthrough(),
				outputSchema: zImpl.object({}),
			});
			const res = await runHappyPathProbe(handle);
			expect(res).toBeNull();
		});

		it('returns null when the tool has no inputSchema/outputSchema', async () => {
			const handle = makeHandle({ toolId: 'fs_read' });
			const res = await runHappyPathProbe(handle);
			expect(res).toBeNull();
		});

		it('returns "ok" when schema accepts the probe input and output matches', async () => {
			const handle = makeHandle({
				toolId: 'fs_read',
				inputSchema: zImpl.object({ path: zImpl.string() }),
				outputSchema: zImpl.object({ content: zImpl.string() }),
				handlerResult: { content: 'hello' },
			});
			const res = await runHappyPathProbe(handle);
			expect(res?.outcome).toBe('ok');
		});

		it('returns "failed" when the probe input is rejected by inputSchema', async () => {
			const handle = makeHandle({
				toolId: 'fs_read',
				// KNOWN_PROBE_INPUTS supplies path = 'plugins/audit/README.md'.
				// Force a schema that requires an .exe extension so the
				// canned input is rejected — proves the schema gate fires.
				inputSchema: zImpl.object({
					path: zImpl.string().regex(/\.exe$/),
				}),
				outputSchema: zImpl.object({}),
			});
			const res = await runHappyPathProbe(handle);
			expect(res?.outcome).toBe('failed');
			expect(res?.detail).toMatch(/probe input rejected/);
		});

		it('returns "failed" with crash detail when the handler throws', async () => {
			const handle = makeHandle({
				toolId: 'fs_write',
				inputSchema: zImpl.object({
					path: zImpl.string(),
					content: zImpl.string(),
				}),
				outputSchema: zImpl.object({}),
				handlerThrows: true,
			});
			const res = await runHappyPathProbe(handle);
			expect(res?.outcome).toBe('failed');
			expect(res?.detail).toContain('handler crashed');
		});

		it('honours a custom probe input builder (OCP test)', async () => {
			const handle = makeHandle({
				toolId: 'custom_tool',
				inputSchema: zImpl.object({ x: zImpl.number() }),
				outputSchema: zImpl.object({ doubled: zImpl.number() }),
				handlerResult: { doubled: 84 },
			});
			const res = await runHappyPathProbe(handle, (id) =>
				id === 'custom_tool' ? { x: 42 } : null,
			);
			expect(res?.outcome).toBe('ok');
		});
	});

	describe('constants', async () => {
		it('HAPPY_PATH_PROBE_IDS is the documented trio (fs_read / fs_write / scaffold)', async () => {
			expect(HAPPY_PATH_PROBE_IDS).toEqual([
				'fs_read',
				'fs_write',
				'scaffold',
			]);
		});

		it('KNOWN_PROBE_INPUTS covers every id in HAPPY_PATH_PROBE_IDS', async () => {
			// Solid-OCP guard: if you add an id to HAPPY_PATH_PROBE_IDS,
			// KNOWN_PROBE_INPUTS must know how to drive it. This test
			// breaks the build otherwise — caught at the same slice.
			for (const id of HAPPY_PATH_PROBE_IDS) {
				expect(KNOWN_PROBE_INPUTS(id)).not.toBeNull();
			}
		});
	});
});
