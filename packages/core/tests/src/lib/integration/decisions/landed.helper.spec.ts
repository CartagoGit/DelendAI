/**
 * landed-work.service.spec.ts — a tip that only merged landed work in
 * carries nothing of its own.
 */
import { describe, expect, it } from 'vitest';

import {
	parentsOutsideMerges,
	workRefFate,
} from '@delendai/core/lib/integration/decisions/landed.helper';

describe('parentsOutsideMerges', () => {
	it('[<6ms] names the parents outside the merges, for the caller to check against the base', () => {
		expect(
			parentsOutsideMerges(['m2 m1 d2', 'm1 w1 d1'].join('\n')),
		).toEqual(['d2', 'w1', 'd1']);
	});

	it('[<5ms] answers undefined as soon as one commit beyond the base is not a merge', () => {
		expect(
			parentsOutsideMerges(['m1 w1 d1', 'w1 b0'].join('\n')),
		).toBeUndefined();
	});

	it('[<5ms] has nothing to check for a tip at the base', () => {
		expect(parentsOutsideMerges('')).toEqual([]);
	});
});

describe('pullRequestLanded', () => {
	it('[<5ms] landed when the forge merged it or its head is contained', async () => {
		const { pullRequestLanded } = await import(
			'@delendai/core/lib/integration/decisions/landed.helper'
		);
		expect(pullRequestLanded({ merged: true, headContained: false })).toBe(
			true,
		);
		expect(pullRequestLanded({ merged: false, headContained: true })).toBe(
			true,
		);
		expect(pullRequestLanded({ merged: false, headContained: false })).toBe(
			false,
		);
	});
});

describe('workRefFate for an open proposal the forge lost', () => {
	const facts = (retiredOnForge: boolean) => ({
		landed: false,
		onForge: false,
		retiredOnForge,
		openAtTip: true,
		openOnIntegration: true,
		worktree: 'in-use' as const,
	});

	it('[<50ms] withdraws a unit the forge retired and restores one it lost', () => {
		const retired = workRefFate(facts(true));
		expect(retired.fate).toBe('withdraw');
		expect(retired.reason).toBe(
			'the forge retired this unit: it is not put back; its next commit of its own publishes it again',
		);
		expect(workRefFate(facts(false)).fate).toBe('restore');
	});
});
