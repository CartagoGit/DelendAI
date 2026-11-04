import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { assessBranchProtection } from './branch-protection.check';

const protection = (
	branches: ReadonlyArray<{ name: string; checks: readonly string[] }>,
): string =>
	`export const BRANCH_PROTECTION = { branches: [${branches
		.map(
			(each) =>
				`{ name: '${each.name}', protected: ${String(each.checks.length > 0)}, required_checks: [${each.checks.map((c) => `'${c}'`).join(', ')}] }`,
		)
		.join(', ')}] };`;

const enforced = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { integration: 'next', release: 'stable' },
		integration: {
			requiredChecks: ['gate'],
			releaseRequiredChecks: ['gate', 'ship'],
		},
	},
});

describe('branch protection against the policy', () => {
	it('judges the branches and checks the policy names, not develop and main', () => {
		const result = assessBranchProtection({
			policy: enforced,
			projection: protection([
				{ name: 'next', checks: ['gate'] },
				{ name: 'stable', checks: ['gate', 'ship'] },
			]),
		});
		expect(result.status).toBe('ok');
	});

	it('names the check a protected branch is missing', () => {
		const result = assessBranchProtection({
			policy: enforced,
			projection: protection([
				{ name: 'next', checks: ['gate'] },
				{ name: 'stable', checks: ['gate'] },
			]),
		});
		expect(result.status).toBe('warn');
		expect(result.findings.join('\n')).toContain(
			'`stable` must require `ship`',
		);
	});

	it('does not warn about a projection file the project does not keep', () => {
		expect(
			assessBranchProtection({ policy: enforced, projection: undefined })
				.status,
		).toBe('ok');
		const observed = resolveDevelopmentPolicy({
			development: {
				profile: 'shared-checkout-merge',
				branches: { integration: 'trunk', release: 'stable' },
			},
		});
		const result = assessBranchProtection({
			policy: observed,
			projection: undefined,
		});
		expect(result.status).toBe('ok');
		expect(result.findings.join('\n')).toContain('observed');
	});

	it('checks one branch once when release is the integration branch', () => {
		const single = resolveDevelopmentPolicy({
			development: {
				profile: 'shared-checkout-merge',
				branches: { integration: 'main', release: 'main' },
			},
		});
		const result = assessBranchProtection({
			policy: single,
			projection: undefined,
		});
		expect(
			result.findings.filter((line) => line.startsWith('integration')),
		).toHaveLength(1);
		expect(result.findings.some((line) => line.startsWith('release'))).toBe(
			false,
		);
	});

	it('is quiet for a project with no policy', () => {
		expect(
			assessBranchProtection({ policy: undefined, projection: undefined })
				.status,
		).toBe('ok');
	});
});
