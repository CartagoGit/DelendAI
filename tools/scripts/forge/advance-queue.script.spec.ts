/**
 * The queue moves after every certification, without blocking the
 * hydrator (x00680, x00683).
 */
import { describe, expect, it } from 'vitest';

import { nextStep } from './advance-queue.script';

describe('nextStep', () => {
	it('dispatches once the tip is certified, and on a red one for its repair path', () => {
		for (const certification of ['certified', 'red']) {
			expect(
				nextStep({ certification, tip: 'b', advancedFor: 'a' }),
			).toBe('dispatch');
		}
	});

	it('leaves a running or missing certification to the next pass', () => {
		for (const certification of ['pending', 'uncertified']) {
			expect(
				nextStep({ certification, tip: 'b', advancedFor: undefined }),
			).toBe('wait');
		}
	});

	it('dispatches only once per tip', () => {
		expect(
			nextStep({
				certification: 'certified',
				tip: 'b',
				advancedFor: 'b',
			}),
		).toBe('done');
	});
});
