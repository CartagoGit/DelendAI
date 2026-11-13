import { describe, expect, it } from 'vitest';

import {
	modelMismatch,
	resolveTaskClassTier,
	tierResolverFor,
} from '../../../../src/lib/routing/task-class-tier.service';

describe('resolveTaskClassTier', () => {
	it('[<20ms] maps mechanical to the small tier and coding to the mid tier', () => {
		expect(resolveTaskClassTier('mechanical')).toEqual({
			ok: true,
			tier: 1,
		});
		expect(resolveTaskClassTier('debugging')).toEqual({
			ok: true,
			tier: 3,
		});
	});

	it('[<20ms] blocks the top tier without owner authorization', () => {
		const decision = resolveTaskClassTier('architecture');
		expect(decision).toMatchObject({ ok: false });
	});

	it('[<20ms] grants the top tier with explicit owner authorization', () => {
		expect(
			resolveTaskClassTier('blocker', { ownerAuthorized: true }),
		).toEqual({ ok: true, tier: 5 });
	});

	it('[<20ms] reads the tier from the configured policy and has none for unknown classes', () => {
		expect(resolveTaskClassTier('docs', { policy: { docs: 2 } })).toEqual({
			ok: true,
			tier: 2,
		});
		expect(resolveTaskClassTier('docs')).toBeUndefined();
	});
});

describe('modelMismatch', () => {
	it('[<20ms] reports a model outside the requested ones', () => {
		expect(modelMismatch(['a', 'b'], 'c')).toContain('c was used');
	});

	it('[<20ms] is silent when the model matches or either side is unknown', () => {
		expect(modelMismatch(['a'], 'a')).toBeUndefined();
		expect(modelMismatch(undefined, 'a')).toBeUndefined();
		expect(modelMismatch(['a'], undefined)).toBeUndefined();
		expect(modelMismatch([], 'a')).toBeUndefined();
	});
});

describe('tierResolverFor', () => {
	it('[<20ms] binds the policy and the owner authorization', () => {
		const resolve = tierResolverFor({
			policy: { architecture: 5 },
			ownerAuthorized: true,
		});
		expect(resolve('architecture')).toEqual({ ok: true, tier: 5 });
		expect(resolve('unknown')).toBeUndefined();
	});
});
