import { describe, expect, it } from 'vitest';

import { keepConnected } from '../host/keep-connected.helper';

const run = (fails: number, stopped = () => false) => {
	const seen: string[] = [];
	let attempts = 0;
	return {
		seen,
		result: keepConnected({
			attempt: async () => {
				attempts += 1;
				if (attempts <= fails)
					throw new Error(`no ${String(attempts)}`);
			},
			stopped,
			onConnected: () => seen.push('connected'),
			onFailed: (failure) => {
				seen.push(failure.message);
			},
			delays: [1, 2],
			wait: async (ms) => {
				seen.push(`wait ${String(ms)}`);
			},
		}),
	};
};

describe('keepConnected', () => {
	it('fills the views on the first connection', async () => {
		const { seen, result } = run(0);
		expect(await result).toBe(true);
		expect(seen).toEqual(['connected']);
	});

	it('says why it failed and tries again', async () => {
		const { seen, result } = run(1);
		expect(await result).toBe(true);
		expect(seen).toEqual(['no 1', 'wait 1', 'connected']);
	});

	it('gives up when its delays run out', async () => {
		const { seen, result } = run(9);
		expect(await result).toBe(false);
		expect(seen).toEqual(['no 1', 'wait 1', 'no 2', 'wait 2', 'no 3']);
	});

	it('stops when the extension is closing', async () => {
		const { seen, result } = run(9, () => true);
		expect(await result).toBe(false);
		expect(seen).toEqual(['no 1', 'wait 1']);
	});
});
