import { describe, expect, it } from 'vitest';

import { commandsOf, flatCommandsOf, inPool } from './run-together.script';

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

describe('flatCommandsOf', () => {
	it('runs a nested chain as its commands, and every command once', () => {
		const scripts = {
			job: 'bun run lint:a && bun run lint:b && bun run lint:c && bun run lint:d',
			'lint:a': 'bun a.ts && bun b.ts',
			'lint:b': 'bun b.ts',
			'lint:c': 'cd x && bun c.ts',
			'lint:d': 'bun run lint:a',
		};
		expect(flatCommandsOf(['job'], scripts)).toEqual([
			'bun a.ts',
			'bun b.ts',
			'bun run lint:c',
		]);
	});

	it('refuses a chain that does not exist', () => {
		expect(() => flatCommandsOf(['nope'], {})).toThrow('no script "nope"');
	});
});
