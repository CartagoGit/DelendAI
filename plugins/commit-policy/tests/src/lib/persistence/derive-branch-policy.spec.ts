/**
 * One question, one answer.
 *
 * The bug these cases exist for: a config declared `shared-checkout-pr`
 * and, in the same file, named `develop` as commit-policy's push
 * target and left `develop` out of its own protected list. Every
 * setting was valid. Together they were the opposite of the profile,
 * and the plugin won, because nothing compared the two.
 */

import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { deriveProtectedBranches } from '../../../../src/lib/persistence/derive-branch-policy';

/**
 * Built with the real resolver, not a hand-shaped cast.
 *
 * A fake policy object is a SECOND definition of what a policy is, and
 * two definitions of one thing is the exact bug this file exists for.
 * Resolving a real profile means the double cannot drift from the
 * contract it stands in for.
 */
const policyWith = (
	allowsDirectIntegrationCommit: boolean,
	integration = 'develop',
) =>
	resolveDevelopmentPolicy({
		development: {
			profile: allowsDirectIntegrationCommit
				? 'shared-direct'
				: 'shared-checkout-pr',
			branches: { integration },
			integration: { requiredChecks: ['delendai-validate'] },
		},
	});

describe('deriveProtectedBranches', () => {
	it('protects the integration branch even when the config forgot it', () => {
		expect(
			deriveProtectedBranches({
				configured: ['main', 'master'],
				policy: policyWith(false),
			}),
		).toContain('develop');
	});

	it('keeps everything the config did list', () => {
		const out = deriveProtectedBranches({
			configured: ['main', 'master'],
			policy: policyWith(false),
		});
		expect(out).toContain('main');
		expect(out).toContain('master');
	});

	it('does not duplicate a branch the config already listed', () => {
		const out = deriveProtectedBranches({
			configured: ['develop'],
			policy: policyWith(false),
		});
		expect(out.filter((name) => name === 'develop')).toHaveLength(1);
	});

	it('protects whatever the integration branch is called', () => {
		expect(
			deriveProtectedBranches({
				configured: [],
				policy: policyWith(false, 'trunk'),
			}),
		).toEqual(['trunk']);
	});

	// A project that opted into direct commits keeps exactly what it
	// configured: deriving is about ending a contradiction, not about
	// overruling a decision somebody made on purpose.
	it('adds nothing when the policy permits direct integration commits', () => {
		expect(
			deriveProtectedBranches({
				configured: ['main'],
				policy: policyWith(true),
			}),
		).toEqual(['main']);
	});

	it('adds nothing when there is no policy at all', () => {
		expect(
			deriveProtectedBranches({
				configured: ['main'],
				policy: undefined,
			}),
		).toEqual(['main']);
	});
});

// The conflict cases moved to
// `packages/core/tests/src/lib/development-policy/validate.spec.ts`,
// next to the detector that `assemble.ts` actually calls. They were
// passing here against a function nobody ran.
