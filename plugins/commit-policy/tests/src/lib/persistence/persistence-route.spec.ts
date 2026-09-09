/**
 * persistence-route.spec.ts — pins the ROUTING rule itself.
 *
 * The single most dangerous defect this feature could ship is adopting
 * the WIP model for a workspace that never asked for it, so the two
 * "keep today's behaviour" cases are asserted as facts about the pure
 * function, not inferred from end-to-end engine behaviour.
 */

import { describe, expect, it } from 'vitest';

import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import type { IResolvedDevelopmentPolicy } from '@delendai/core/lib/contracts/interfaces/development-policy.interface';

import {
	movesHead,
	refuseIfMovesHead,
	resolvePersistenceRoute,
} from '../../../../src/lib/persistence/persistence-route';

describe('resolvePersistenceRoute', () => {
	it('keeps the direct-commit path when no policy is projected', () => {
		const route = resolvePersistenceRoute(undefined);
		expect(route.kind).toBe('direct-commit');
	});

	it('keeps the direct-commit path for shared-direct', () => {
		const route = resolvePersistenceRoute(expandProfile('shared-direct'));
		expect(route.kind).toBe('direct-commit');
	});

	it('keeps the direct-commit path for a legacy-compat policy', () => {
		const legacy: IResolvedDevelopmentPolicy = {
			...expandProfile('shared-direct'),
			profile: 'custom',
			source: 'legacy-compat',
		};
		expect(resolvePersistenceRoute(legacy).kind).toBe('direct-commit');
	});

	it('routes shared-checkout-pr to the WIP ref path', () => {
		const route = resolvePersistenceRoute(
			expandProfile('shared-checkout-pr'),
		);
		expect(route.kind).toBe('wip-ref');
	});

	it('refuses a WIP policy with no work-ref template', () => {
		const base = expandProfile('shared-checkout-pr');
		const broken: IResolvedDevelopmentPolicy = {
			...base,
			branches: { ...base.branches, workRefTemplate: '' },
		};
		const route = resolvePersistenceRoute(broken);
		expect(route.kind).toBe('refused');
		if (route.kind !== 'refused') throw new Error('unreachable');
		expect(route.code).toBe('POLICY_ROUTE_UNSUPPORTED');
		expect(route.remedy.length).toBeGreaterThan(0);
	});

	it('refuses branch persistence in a pinned checkout, structurally', () => {
		const base = expandProfile('shared-checkout-pr');
		const pinnedBranchModel: IResolvedDevelopmentPolicy = {
			...base,
			persistence: {
				strategy: 'branch',
				usesWipRefs: false,
				exactScope: true,
				allowsDirectIntegrationCommit: false,
			},
		};
		const route = resolvePersistenceRoute(pinnedBranchModel);
		expect(route.kind).toBe('refused');
		if (route.kind !== 'refused') throw new Error('unreachable');
		expect(route.code).toBe('PINNED_CHECKOUT');
		expect(route.reason).toContain('moves HEAD');
	});
});

describe('refuseIfMovesHead', () => {
	it('names every HEAD-moving verb', () => {
		expect(movesHead('switch')).toBe(true);
		expect(movesHead('checkout')).toBe(true);
		expect(movesHead('reset')).toBe(true);
		expect(movesHead('commit-tree')).toBe(false);
		expect(movesHead('update-ref')).toBe(false);
	});

	it('returns a structured refusal instead of throwing, under a pin', () => {
		const refusal = refuseIfMovesHead(expandProfile('shared-checkout-pr'), {
			verb: 'checkout',
			description: 'restoring a work ref into the tree',
		});
		expect(refusal).toBeDefined();
		expect(refusal?.code).toBe('PINNED_CHECKOUT');
		expect(refusal?.remedy.length).toBeGreaterThan(0);
	});

	it('permits HEAD movement when the policy does not pin the checkout', () => {
		expect(
			refuseIfMovesHead(expandProfile('worktree-pr'), {
				verb: 'switch',
				description: 'moving to the agent worktree branch',
			}),
		).toBeUndefined();
	});

	it('permits non-HEAD-moving plumbing under a pin', () => {
		expect(
			refuseIfMovesHead(expandProfile('shared-checkout-pr'), {
				verb: 'update-ref',
				description: 'advancing a wip ref',
			}),
		).toBeUndefined();
	});
});
