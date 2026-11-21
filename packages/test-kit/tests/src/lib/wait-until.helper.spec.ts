import { describe, expect, it } from 'vitest';

import { waitUntil } from '../../../src/lib/wait-until.helper';

describe('waitUntil (x00590)', () => {
	it('returns as soon as the condition holds', async () => {
		const started = Date.now();
		let ready = false;
		setTimeout(() => {
			ready = true;
		}, 30);
		await waitUntil('ready', () => ready);
		// The point: it does not wait out a fixed sleep. A 400ms sleep
		// would have cost 400ms here whatever happened.
		expect(Date.now() - started).toBeLessThan(300);
	});

	it('returns immediately when it already holds', async () => {
		const started = Date.now();
		await waitUntil('already true', () => true);
		expect(Date.now() - started).toBeLessThan(50);
	});

	it('accepts an async condition', async () => {
		let ready = false;
		setTimeout(() => {
			ready = true;
		}, 20);
		await waitUntil('async ready', async () => ready);
		expect(ready).toBe(true);
	});

	it('names what it was waiting for when it gives up', async () => {
		// A timeout saying "condition not met" tells the next reader
		// nothing, and they are usually reading it because CI failed and
		// they cannot reproduce it.
		await expect(
			waitUntil('the poll to report a slice', () => false, {
				timeoutMs: 40,
			}),
		).rejects.toThrow('the poll to report a slice');
	});

	it('states its own ceiling in the failure', async () => {
		await expect(
			waitUntil('never', () => false, { timeoutMs: 30 }),
		).rejects.toThrow('30ms');
	});
});
