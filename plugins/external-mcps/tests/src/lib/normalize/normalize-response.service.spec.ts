import { describe, expect, it } from 'vitest';

import { normalizeResponse } from '../../../../src/lib/normalize/normalize-response.service';

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
