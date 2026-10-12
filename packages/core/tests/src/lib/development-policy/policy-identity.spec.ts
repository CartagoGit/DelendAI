/**
 * policy-identity.spec.ts — the identity axis resolves, validates and
 * defaults the way guard.unknownActor does (f00758).
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import { validateDevelopmentPolicy } from '@delendai/core/lib/development-policy/validate';

const base = { development: { profile: 'shared-checkout-pr' } };

describe('development.identity resolves', () => {
	it('is absent when nothing declares it', () => {
		expect(resolveDevelopmentPolicy(base).identity).toBeUndefined();
	});

	it('carries a declared block through as written', () => {
		const policy = resolveDevelopmentPolicy({
			development: {
				profile: 'shared-checkout-pr',
				identity: { providerBridge: false },
			},
		});
		expect(policy.identity).toEqual({ providerBridge: false });
	});

	it('accepts both forms of unrecognizedModel', () => {
		expect(
			resolveDevelopmentPolicy({
				development: {
					profile: 'shared-checkout-pr',
					identity: { unrecognizedModel: 'refuse' },
				},
			}).identity,
		).toEqual({ unrecognizedModel: 'refuse' });
		expect(
			resolveDevelopmentPolicy({
				development: {
					profile: 'shared-checkout-pr',
					identity: { unrecognizedModel: { use: 'shared-agent' } },
				},
			}).identity,
		).toEqual({ unrecognizedModel: { use: 'shared-agent' } });
	});

	it('carries an unrecognised word through for the validator to name', () => {
		// The schema accepts any non-empty string on purpose: "you wrote X,
		// valid values are Y" beats "invalid enum value".
		const policy = resolveDevelopmentPolicy({
			development: {
				profile: 'shared-checkout-pr',
				identity: { unrecognizedModel: 'whatever' },
			},
		});
		expect(policy.identity).toEqual({ unrecognizedModel: 'whatever' });
		const violations = validateDevelopmentPolicy(policy);
		const found = violations.find(
			(v) => v.path === 'identity.unrecognizedModel',
		);
		expect(found).toBeDefined();
		expect(found?.remedy).toContain('refuse');
	});

	it('ignores a block with nothing usable in it', () => {
		expect(
			resolveDevelopmentPolicy({
				development: {
					profile: 'shared-checkout-pr',
					identity: { providerBridge: 'yes' as unknown as boolean },
				},
			}).identity,
		).toBeUndefined();
	});
});

describe('development.identity validates', () => {
	it('accepts the canonical shapes', () => {
		for (const identity of [
			{ providerBridge: false },
			{ unrecognizedModel: 'refuse' },
			{ unrecognizedModel: { use: 'shared-agent' } },
		]) {
			const policy = resolveDevelopmentPolicy({
				development: { profile: 'shared-checkout-pr', identity },
			});
			const paths = validateDevelopmentPolicy(policy)
				.map((v) => v.path)
				.filter((path) => path.startsWith('identity'));
			expect(paths).toEqual([]);
		}
	});

	it('refuses a rename that cannot survive normalisation', () => {
		const policy = resolveDevelopmentPolicy({
			development: {
				profile: 'shared-checkout-pr',
				identity: { unrecognizedModel: { use: '!!!' } },
			},
		});
		// The resolver stores the name as written (only a non-empty one);
		// the validator is where an all-punctuation name is refused, with
		// the rule that says why.
		expect(
			validateDevelopmentPolicy(policy).some(
				(v) =>
					v.path === 'identity.unrecognizedModel.use' &&
					v.rule === 'identity-unusable-rename',
			),
		).toBe(true);
	});
});
