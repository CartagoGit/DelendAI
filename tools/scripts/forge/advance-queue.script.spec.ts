/**
 * The queue moves after every merge, once per tip, waiting for no full
 * run of the integration branch.
 */
import { describe, expect, it } from 'vitest';

import { nextStep } from './advance-queue.script';

describe('nextStep', () => {
	it('dispatches the queue for a tip it has not moved for, with no certification asked', () => {
		expect(nextStep({ tip: 'b', advancedFor: 'a' })).toBe('dispatch');
		expect(nextStep({ tip: 'b', advancedFor: undefined })).toBe('dispatch');
	});

	it('dispatches only once per tip', () => {
		expect(nextStep({ tip: 'b', advancedFor: 'b' })).toBe('done');
	});
});
