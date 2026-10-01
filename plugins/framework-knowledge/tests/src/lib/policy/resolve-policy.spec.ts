// resolve-policy.spec.ts: pin the priority order and the `removed`
// refusal.

import { describe, expect, it } from 'vitest';

import { resolvePolicy } from '../../../../src/lib/policy/resolve-policy';
import type { IPolicyInputs } from '../../../../src/lib/contracts/interfaces/policy.interface';

const options: IPolicyInputs['options'] = [
	{ value: 'inline-template', force: 'supported' },
	{ value: 'external-template', force: 'recommended' },
	{ value: 'legacy-template', force: 'removed' },
];

const base: IPolicyInputs = {
	options,
	defaultValue: 'external-template',
};

describe('resolvePolicy', () => {
	it('falls back to delendai default when nothing else answers', () => {
		expect(resolvePolicy(base)).toEqual({
			outcome: 'resolved',
			value: 'external-template',
			source: 'default',
			force: 'recommended',
		});
	});

	it('picks the framework recommendation over the default', () => {
		expect(
			resolvePolicy({
				...base,
				frameworkRecommendation: 'inline-template',
			}),
		).toEqual({
			outcome: 'resolved',
			value: 'inline-template',
			source: 'framework-recommendation',
			force: 'supported',
		});
	});

	it('picks the detected convention over the framework recommendation', () => {
		expect(
			resolvePolicy({
				...base,
				frameworkRecommendation: 'external-template',
				detectedConvention: {
					value: 'inline-template',
					confidence: 0.9,
				},
			}),
		).toEqual({
			outcome: 'resolved',
			value: 'inline-template',
			source: 'detected-convention',
			force: 'supported',
		});
	});

	it('picks the project preference over the detected convention', () => {
		expect(
			resolvePolicy({
				...base,
				detectedConvention: {
					value: 'external-template',
					confidence: 0.9,
				},
				projectPreference: 'inline-template',
			}),
		).toEqual({
			outcome: 'resolved',
			value: 'inline-template',
			source: 'project',
			force: 'supported',
		});
	});

	it('picks the user preference over the project preference', () => {
		expect(
			resolvePolicy({
				...base,
				projectPreference: 'external-template',
				userPreference: 'inline-template',
			}),
		).toEqual({
			outcome: 'resolved',
			value: 'inline-template',
			source: 'user',
			force: 'supported',
		});
	});

	it('treats a value with no matching option as supported', () => {
		expect(
			resolvePolicy({ ...base, userPreference: 'unknown-approach' }),
		).toEqual({
			outcome: 'resolved',
			value: 'unknown-approach',
			source: 'user',
			force: 'supported',
		});
	});

	it('refuses a user preference the installed version removed, naming why', () => {
		expect(
			resolvePolicy({ ...base, userPreference: 'legacy-template' }),
		).toEqual({
			outcome: 'incompatible',
			value: 'legacy-template',
			source: 'user',
			reason: 'legacy-template is removed at the installed framework version',
		});
	});

	it('does not fall back to a lower-priority source when the winner is removed', () => {
		const result = resolvePolicy({
			...base,
			userPreference: 'legacy-template',
			projectPreference: 'inline-template',
		});
		expect(result.outcome).toBe('incompatible');
		expect(result.value).toBe('legacy-template');
	});

	it('refuses a removed detected convention, not just a removed preference', () => {
		expect(
			resolvePolicy({
				...base,
				detectedConvention: {
					value: 'legacy-template',
					confidence: 0.7,
				},
			}),
		).toEqual({
			outcome: 'incompatible',
			value: 'legacy-template',
			source: 'detected-convention',
			reason: 'legacy-template is removed at the installed framework version',
		});
	});

	it('lets a caller-declared technical impossibility override every other input', () => {
		expect(
			resolvePolicy({
				...base,
				userPreference: 'inline-template',
				technicalImpossibility: { reason: 'no compiler installed' },
			}),
		).toEqual({
			outcome: 'incompatible',
			value: 'inline-template',
			source: 'technical-impossibility',
			reason: 'no compiler installed',
		});
	});

	it('names the default value when technical impossibility is declared with no other input', () => {
		expect(
			resolvePolicy({
				...base,
				technicalImpossibility: { reason: 'no compiler installed' },
			}),
		).toEqual({
			outcome: 'incompatible',
			value: 'external-template',
			source: 'technical-impossibility',
			reason: 'no compiler installed',
		});
	});
});
