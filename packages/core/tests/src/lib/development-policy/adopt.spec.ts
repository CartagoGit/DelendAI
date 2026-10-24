/**
 * adopt.spec.ts — adoption writes down the policy a project is already
 * working under, and nothing else.
 *
 * The cases that matter are the ones where adoption could diverge from
 * enforcement: a forge that looks like it should change the model, and a
 * decision somebody already made.
 */
import { describe, expect, it } from 'vitest';

import { proposeAdoption } from '@delendai/core/lib/development-policy/adopt';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import { validateDevelopmentPolicy } from '@delendai/core/lib/development-policy/validate';

describe('proposeAdoption', () => {
	it('records the default policy and the branches it resolved', () => {
		const policy = {
			...resolveDevelopmentPolicy({}),
			branches: {
				...resolveDevelopmentPolicy({}).branches,
				integration: 'trunk',
				release: 'trunk',
			},
		};

		const proposal = proposeAdoption(policy);

		expect(proposal.block).toEqual({
			profile: 'shared-checkout-merge',
			branches: { integration: 'trunk', release: 'trunk' },
		});
		expect(proposal.reasons.join('\n')).toContain(
			'asks nothing of the forge',
		);
	});

	it('writes a block that resolves back to the policy it was taken from', () => {
		const policy = resolveDevelopmentPolicy({});
		const { block } = proposeAdoption(policy);

		const again = resolveDevelopmentPolicy({ development: block });

		expect(validateDevelopmentPolicy(again)).toEqual([]);
		expect({ ...again, source: policy.source }).toEqual(policy);
	});

	it('never overwrites a project that already decided', () => {
		const proposal = proposeAdoption(
			resolveDevelopmentPolicy({
				development: { profile: 'worktree-pr' },
			}),
		);

		expect(proposal.block).toBeUndefined();
		expect(proposal.reasons[0]).toContain('already states');
	});

	it('leaves legacy fields as written, because they are a decision', () => {
		const proposal = proposeAdoption(
			resolveDevelopmentPolicy({ legacy: { agentWorktree: false } }),
		);

		expect(proposal.block).toBeUndefined();
		expect(proposal.reasons[0]).toContain('legacy');
	});

	it('offers the pull-request model only when init brings forge evidence', () => {
		const policy = resolveDevelopmentPolicy({});

		const atStartup = proposeAdoption(policy);
		const atInit = proposeAdoption(policy, {
			forge: 'github',
			canRequireChecks: true,
		});
		const unknownRights = proposeAdoption(policy, { forge: 'github' });

		expect(atStartup.block?.profile).toBe('shared-checkout-merge');
		expect(atInit.block?.profile).toBe('shared-checkout-pr');
		expect(atInit.reasons.join('\n')).toContain('GitHub');
		// Unknown is not permission.
		expect(unknownRights.block?.profile).toBe('shared-checkout-merge');
	});
});
