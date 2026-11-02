import { describe, expect, it } from 'vitest';

import { commandsOf, inPool } from './run-together.script';

describe('commandsOf', () => {
	it('reads the commands of a chain', () => {
		expect(commandsOf('bun run a && bun run b ')).toEqual([
			'bun run a',
			'bun run b',
		]);
	});
});

describe('inPool', () => {
	it('keeps the order and never passes the limit', async () => {
		let running = 0;
		let peak = 0;
		const doubled = await inPool([1, 2, 3, 4], 2, async (item) => {
			running += 1;
			peak = Math.max(peak, running);
			await Promise.resolve();
			running -= 1;
			return item * 2;
		});
		expect(doubled).toEqual([2, 4, 6, 8]);
		expect(peak).toBe(2);
	});
});
