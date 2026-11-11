/**
 * compute-slot-follow.helper.spec.ts — a joiner never runs a turn twice
 * because the claimant finished between its two reads.
 */
import { describe, expect, it, vi } from 'vitest';

import { followTurn } from '@delendai/core/lib/shared/compute-slot-follow.helper';

describe('followTurn', () => {
	it('[<20ms] returns the result of a turn that finished between its two reads', async () => {
		// The exact interleaving CI hit: no result yet, then the claimant
		// writes its result and takes its claim off, then the claim is read.
		const reads: (string | undefined)[] = [undefined, 'proof'];
		const pause = vi.fn(async () => undefined);
		const result = await followTurn({
			readResult: async () => reads.shift(),
			claimHeld: async () => false,
			pause,
		});
		expect(result).toBe('proof');
		expect(pause).not.toHaveBeenCalled();
	});

	it('[<20ms] reports a turn whose claimant died without a result', async () => {
		expect(
			await followTurn({
				readResult: async () => undefined,
				claimHeld: async () => false,
				pause: async () => undefined,
			}),
		).toBeUndefined();
	});

	it('[<20ms] waits while the claim is held, then returns the result', async () => {
		const reads: (string | undefined)[] = [undefined, undefined, 'done'];
		const pause = vi.fn(async () => undefined);
		const result = await followTurn({
			readResult: async () => reads.shift(),
			claimHeld: async () => true,
			pause,
		});
		expect(result).toBe('done');
		expect(pause).toHaveBeenCalledTimes(2);
	});
});
