/**
 * held-by-any.helper.spec.ts — what a set of refs holds is read once, and one
 * question per pair is only the fallback.
 */
import { describe, expect, it } from 'vitest';

import { heldByAny } from '@delendai/core/lib/startup-reconciler/phases/held-by-any.helper';

describe('heldByAny', () => {
	it('lists the tips once, however many checkpoints it answers', async () => {
		let listed = 0;
		const held = heldByAny(
			{
				isAncestor: async () => {
					throw new Error('no question per pair');
				},
				reachableFrom: async () => {
					listed += 1;
					return new Set(['a']);
				},
			},
			['tip', 'other'],
		);
		expect(await held('a')).toBe(true);
		expect(await held('b')).toBe(false);
		expect(listed).toBe(1);
	});

	it('asks nothing of git when there are no tips', async () => {
		const held = heldByAny(
			{
				isAncestor: async () => {
					throw new Error('nothing to ask');
				},
			},
			[],
		);
		expect(await held('a')).toBe(false);
	});

	it('asks pair by pair when git could not list the tips', async () => {
		const held = heldByAny(
			{
				isAncestor: async (sha, tip) => sha === 'a' && tip === 'other',
				reachableFrom: async () => undefined,
			},
			['tip', 'other'],
		);
		expect(await held('a')).toBe(true);
		expect(await held('b')).toBe(false);
	});

	it('takes a tip for itself on a seam with no listing', async () => {
		const held = heldByAny({ isAncestor: async () => false }, ['tip']);
		expect(await held('tip')).toBe(true);
	});
});
