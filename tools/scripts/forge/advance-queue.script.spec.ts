/**
 * The queue moves after every certification (x00680).
 */
import { describe, expect, it } from 'vitest';

import { nextStep } from './advance-queue.script';

describe('nextStep', () => {
	it('dispatches the queue once the tip is certified, and on a red one for its repair path', () => {
		for (const certification of ['certified', 'red']) {
			expect(
				nextStep({ certification, tipMoved: false, waitedMs: 0 }),
			).toBe('dispatch');
		}
	});

	it('waits while the certification runs, then gives up after its patience', () => {
		expect(
			nextStep({
				certification: 'pending',
				tipMoved: false,
				waitedMs: 60_000,
			}),
		).toBe('wait');
		expect(
			nextStep({
				certification: 'pending',
				tipMoved: false,
				waitedMs: 51 * 60_000,
			}),
		).toBe('give-up');
	});

	it('stands down when the integration branch moved: that move advances the queue', () => {
		expect(
			nextStep({
				certification: 'certified',
				tipMoved: true,
				waitedMs: 0,
			}),
		).toBe('stand-down');
	});
});
