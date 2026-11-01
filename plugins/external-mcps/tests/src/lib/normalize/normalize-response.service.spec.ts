import { describe, expect, it } from 'vitest';

import {
	childToolError,
	normalizeResponse,
} from '../../../../src/lib/normalize/normalize-response.service';

describe('normalizeResponse', () => {
	it('keeps the raw answer behind a handle and returns its facts', async () => {
		const kept = new Map<string, string>();
		const raw = {
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						nodes: Array.from({ length: 500 }, (_, i) => ({
							id: i,
							name: `n${String(i)}`,
						})),
					}),
				},
			],
		};
		const answer = await normalizeResponse(raw, async (handle, json) => {
			kept.set(handle, json);
		});
		expect(answer.handle).toMatch(/^ext-raw:[0-9a-f]{16}$/u);
		expect(kept.get(answer.handle)).toBe(JSON.stringify(raw));
		expect(answer.facts['content[0].nodes.length']).toBe(500);
		expect(answer.factBytes).toBeLessThan(answer.rawBytes / 50);
	});

	it('prefers structured content and cuts long text', async () => {
		const answer = await normalizeResponse(
			{ structuredContent: { title: 'x'.repeat(1000), ok: true } },
			async () => undefined,
		);
		expect(String(answer.facts.title).length).toBeLessThan(410);
		expect(answer.facts.ok).toBe(true);
	});
});

describe('childToolError and isError', () => {
	it('reads the explanatory text of an in-band tool error', () => {
		expect(
			childToolError({
				isError: true,
				content: [{ type: 'text', text: 'node not found' }],
			}),
		).toBe('node not found');
	});

	it('names an error that carries no text', () => {
		expect(childToolError({ isError: true })).toContain(
			'reported an error',
		);
	});

	it('is undefined for a successful or non-object result', () => {
		expect(childToolError({ content: [] })).toBeUndefined();
		expect(childToolError({ isError: false })).toBeUndefined();
		expect(childToolError('text')).toBeUndefined();
		expect(childToolError(null)).toBeUndefined();
	});

	it('keeps the error flag on the normalized answer', async () => {
		const failed = await normalizeResponse(
			{ isError: true, content: [{ type: 'text', text: 'boom' }] },
			async () => undefined,
		);
		const fine = await normalizeResponse(
			{ content: [{ type: 'text', text: 'ok' }] },
			async () => undefined,
		);
		expect(failed.isError).toBe(true);
		expect(fine.isError).toBeUndefined();
	});
});
