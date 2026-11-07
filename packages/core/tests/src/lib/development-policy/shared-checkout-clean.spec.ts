/**
 * shared-checkout-clean.spec.ts — which profiles give every unit its own
 * worktree, which keep the shared checkout clean, and what a refusal says.
 */
import { describe, expect, it } from 'vitest';

import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import {
	listedPaths,
	looseEditsRefusal,
	sharedCheckoutStaysClean,
	unitsHaveWorktrees,
} from '@delendai/core/lib/development-policy/shared-checkout-clean';

describe('shared-checkout-clean', () => {
	it.each([
		['shared-checkout-pr', true, true],
		['shared-checkout-merge', true, true],
		['worktree-pr', true, false],
		['shared-direct', false, false],
	] as const)(
		'%s: unit worktrees %s, stays clean %s',
		(profile, units, clean) => {
			const policy = expandProfile(profile);
			expect(unitsHaveWorktrees(policy)).toBe(units);
			expect(sharedCheckoutStaysClean(policy)).toBe(clean);
		},
	);

	it('lists five paths, sorted, and counts the rest', () => {
		expect(listedPaths(['f', 'e', 'd', 'c', 'b', 'a', 'g'])).toBe(
			'a, b, c, d, e and 2 more',
		);
	});

	it('names the shared checkout, its edits and work rescue', () => {
		const refusal = looseEditsRefusal('/repo', ['b.ts', 'a.ts']);
		expect(refusal.reason).toContain(
			'/repo holds 2 loose edit(s): a.ts, b.ts',
		);
		expect(refusal.remedy).toContain('delendai work rescue');
	});
});
