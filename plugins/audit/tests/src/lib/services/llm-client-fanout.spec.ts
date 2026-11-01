/**
 * callLlmFanOut runs every target: concurrency is bounded, the queue is not.
 */
import { describe, expect, it } from 'vitest';

import { callLlmFanOut } from '../../../../src/lib/services/llm-fan-out.service';
import {
	type IHttpTransport,
	type IModelTarget,
} from '../../../../src/lib/services/llm-client.service';

const targets = (count: number): IModelTarget[] =>
	Array.from({ length: count }, (_, index) => ({
		provider: 'openai' as const,
		model: `model-${String(index + 1)}`,
		apiKey: 'k',
	}));

const countingTransport = (): IHttpTransport & {
	readonly models: string[];
	peak: () => number;
} => {
	const models: string[] = [];
	let running = 0;
	let peak = 0;
	return {
		models,
		peak: () => peak,
		async fetchJson(_url, init) {
			running += 1;
			peak = Math.max(peak, running);
			const model = (JSON.parse(init.body) as { model: string }).model;
			models.push(model);
			await new Promise((resolve) => setTimeout(resolve, 5));
			running -= 1;
			return {
				status: 200,
				json: { choices: [{ message: { content: `# ${model}` } }] },
			};
		},
	};
};

describe('callLlmFanOut', () => {
	it('calls every target past the fourth and keeps the input order', async () => {
		const transport = countingTransport();
		const outcomes = await callLlmFanOut(targets(7), 'brief', {
			transport,
		});
		expect(transport.models.sort()).toEqual(
			targets(7)
				.map((t) => t.model)
				.sort(),
		);
		expect(outcomes.map((o) => o.target.model)).toEqual(
			targets(7).map((t) => t.model),
		);
		expect(outcomes.every((o) => o.ok)).toBe(true);
	});

	it('never has more than four calls in flight', async () => {
		const transport = countingTransport();
		await callLlmFanOut(targets(8), 'brief', { transport });
		expect(transport.peak()).toBeLessThanOrEqual(4);
		expect(transport.peak()).toBeGreaterThan(1);
	});

	it('returns nothing for no targets', async () => {
		expect(await callLlmFanOut([], 'brief', {})).toEqual([]);
	});
});
