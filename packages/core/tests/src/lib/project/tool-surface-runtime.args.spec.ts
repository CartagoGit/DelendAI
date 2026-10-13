import { describe, expect, it } from 'vitest';
import z from 'zod';

import { safeParseSurfaceArgs } from '@delendai/core/lib/project/tool-surface-runtime.helper';

const queue = z.object({
	limit: z.number().int().min(1).max(50).optional(),
	agent: z.string().optional(),
	detail: z.boolean().optional(),
	ids: z.array(z.string()).optional(),
	filter: z.object({ status: z.string() }).optional(),
	nested: z.object({ offset: z.number() }).optional(),
});

describe('a routed call takes the arguments a host sends', () => {
	it('reads text the schema expected as a number or a boolean as that type', async () => {
		expect(
			await safeParseSurfaceArgs(queue, {
				limit: '50',
				detail: 'true',
				agent: 'minimax-m3',
			}),
		).toEqual({
			ok: true,
			value: { limit: 50, detail: true, agent: 'minimax-m3' },
		});
	});

	it('reads JSON text the schema expected as an array or an object', async () => {
		expect(
			await safeParseSurfaceArgs(queue, {
				ids: '["x00001","x00002"]',
				filter: '{"status":"review"}',
				nested: { offset: '10' },
			}),
		).toEqual({
			ok: true,
			value: {
				ids: ['x00001', 'x00002'],
				filter: { status: 'review' },
				nested: { offset: 10 },
			},
		});
	});

	it('leaves a string field a string, even when it looks like a number', async () => {
		expect(await safeParseSurfaceArgs(queue, { agent: '42' })).toEqual({
			ok: true,
			value: { agent: '42' },
		});
	});

	it('still refuses what the schema refuses once read as its type', async () => {
		for (const args of [
			{ limit: '500' },
			{ limit: 'fifty' },
			{ limit: '' },
			{ detail: 'yes' },
			{ ids: '{"a":1}' },
			{ filter: 'not json' },
		]) {
			const parsed = await safeParseSurfaceArgs(queue, args);
			expect(parsed.ok, JSON.stringify(args)).toBe(false);
		}
	});

	it('does not change the arguments the caller passed', async () => {
		const args = { limit: '5' };
		await safeParseSurfaceArgs(queue, args);
		expect(args).toEqual({ limit: '5' });
	});

	it('passes arguments through when there is no schema to read them by', async () => {
		expect(await safeParseSurfaceArgs(undefined, { limit: '5' })).toEqual({
			ok: true,
			value: { limit: '5' },
		});
		expect(await safeParseSurfaceArgs({}, { limit: '5' })).toEqual({
			ok: true,
			value: { limit: '5' },
		});
	});

	it('refuses text that is not an object when the whole input is text', async () => {
		expect((await safeParseSurfaceArgs(queue, 'limit=5')).ok).toBe(false);
	});
});
