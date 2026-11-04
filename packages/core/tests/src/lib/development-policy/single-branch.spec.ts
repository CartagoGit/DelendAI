/**
 * single-branch.spec.ts — a project with one branch is a valid shape.
 *
 * A project whose only branch is `main` integrates and releases there.
 * The policy says so by naming the same branch for both roles, or by
 * naming an integration branch and no release branch. Each consumer of
 * the release branch is held to the same reading: no second boundary is
 * invented, no branch is protected twice, and nothing refuses the
 * integration branch as a release target.
 */
import { describe, expect, it } from 'vitest';

import { briefWorkModel } from '@delendai/core/lib/development-policy/declare-workflow';
import { servedWorkModelLines } from '@delendai/core/lib/development-policy/served-work-model';
import { judgeGitOperation } from '@delendai/core/lib/development-policy/git-guard';
import { policyNamespaces } from '@delendai/core/lib/development-policy/git-guard-namespaces';
import {
	hasSeparateReleaseBranch,
	protectedBranchNames,
	singleBranchWarnings,
} from '@delendai/core/lib/development-policy/release-branch';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import { validateDevelopmentPolicy } from '@delendai/core/lib/development-policy/validate';
import { buildDesiredState } from '@delendai/core/lib/forge-governance/index';

const AGENT = { agentMarker: 'AI_AGENT' } as const;

const policyFor = (development: Record<string, unknown>) =>
	resolveDevelopmentPolicy({ development });

const rulesFor = (development: Record<string, unknown>): readonly string[] =>
	validateDevelopmentPolicy(policyFor(development)).map((v) => v.rule);

const PROFILES = [
	'shared-direct',
	'shared-checkout-merge',
	'shared-checkout-pr',
	'worktree-pr',
] as const;

describe('resolving a project with one branch', () => {
	it('reads an omitted release as the integration branch', () => {
		const policy = policyFor({
			profile: 'shared-checkout-merge',
			branches: { integration: 'main' },
		});

		expect(policy.branches.release).toBe('main');
		expect(hasSeparateReleaseBranch(policy.branches)).toBe(false);
	});

	it('accepts the same branch named for both roles as the same thing', () => {
		const policy = policyFor({
			profile: 'shared-checkout-merge',
			branches: { integration: 'main', release: 'main' },
		});

		expect(hasSeparateReleaseBranch(policy.branches)).toBe(false);
		expect(protectedBranchNames(policy.branches)).toEqual(['main']);
	});

	it('keeps a release branch the project names', () => {
		const policy = policyFor({
			profile: 'shared-checkout-merge',
			branches: { integration: 'develop', release: 'stable' },
		});

		expect(policy.branches.release).toBe('stable');
		expect(hasSeparateReleaseBranch(policy.branches)).toBe(true);
		expect(protectedBranchNames(policy.branches)).toEqual([
			'develop',
			'stable',
		]);
	});

	it('leaves the profile default pair alone when no branch is declared', () => {
		const policy = policyFor({ profile: 'shared-checkout-merge' });

		expect(policy.branches.integration).toBe('develop');
		expect(policy.branches.release).toBe('main');
		expect(hasSeparateReleaseBranch(policy.branches)).toBe(true);
	});
});

describe('validating a project with one branch', () => {
	it('starts under every profile with integration and release both main', () => {
		for (const profile of PROFILES) {
			const branches = { integration: 'main', release: 'main' };
			const development: Record<string, unknown> = {
				profile,
				branches,
				...(profile.endsWith('-pr')
					? { integration: { requiredChecks: ['verify'] } }
					: {}),
			};
			expect(rulesFor(development), profile).toEqual([]);
		}
	});

	it('starts under every profile with the release branch omitted', () => {
		for (const profile of PROFILES) {
			const development: Record<string, unknown> = {
				profile,
				branches: { integration: 'main' },
				...(profile.endsWith('-pr')
					? { integration: { requiredChecks: ['verify'] } }
					: {}),
			};
			expect(rulesFor(development), profile).toEqual([]);
		}
	});

	it('does not hold a branch to a release stricter than itself', () => {
		// Release approvals below integration approvals contradict each
		// other only when there are two branches to compare.
		const single = {
			profile: 'shared-checkout-pr',
			branches: { integration: 'main' },
			integration: {
				requiredChecks: ['verify'],
				requiredApprovals: 2,
				releaseRequiredApprovals: 0,
			},
		};
		expect(rulesFor(single)).toEqual([]);
		expect(
			rulesFor({
				...single,
				branches: { integration: 'develop', release: 'main' },
			}),
		).toContain('release-approvals-not-weaker');
	});

	it('still requires an integration branch to be named', () => {
		const policy = policyFor({ profile: 'shared-checkout-merge' });
		const nameless = {
			...policy,
			branches: { ...policy.branches, integration: '', release: '' },
		};
		expect(
			validateDevelopmentPolicy(nameless).map((v) => v.rule),
		).toContain('integration-branch-required');
	});
});

describe('warnings for release settings nothing applies', () => {
	const stricter = policyFor({
		profile: 'shared-checkout-pr',
		branches: { integration: 'main' },
		integration: {
			requiredChecks: ['verify'],
			releaseRequiredChecks: ['verify', 'publish-dry-run'],
			requiredApprovals: 0,
			releaseRequiredApprovals: 1,
		},
	});

	it('surfaces a stricter-release concern as a warning, never a violation', () => {
		expect(validateDevelopmentPolicy(stricter)).toEqual([]);
		const warnings = singleBranchWarnings(stricter);
		expect(warnings).toHaveLength(2);
		expect(warnings.join('\n')).toContain('releaseRequiredApprovals');
		expect(warnings.join('\n')).toContain('releaseRequiredChecks');
	});

	it('says nothing when the project has a release branch of its own', () => {
		const separate = policyFor({
			profile: 'shared-checkout-pr',
			branches: { integration: 'develop', release: 'main' },
			integration: {
				requiredChecks: ['verify'],
				releaseRequiredChecks: ['verify', 'publish-dry-run'],
			},
		});
		expect(singleBranchWarnings(separate)).toEqual([]);
	});

	it('reaches the instructions an agent is served', () => {
		const served = servedWorkModelLines(stricter);
		expect(
			served.filter((line) => line.startsWith('Warning:')),
		).toHaveLength(2);
	});
});

describe('what the served instructions say', () => {
	const single = policyFor({
		profile: 'shared-checkout-merge',
		branches: { integration: 'main' },
	});

	it('names no release branch that does not exist', () => {
		const lines = servedWorkModelLines(single).join('\n');
		expect(lines).toContain(
			'main is both the integration and the release branch',
		);
		expect(lines).not.toContain('release branch main');
		expect(briefWorkModel(single).integrationBranch).toBe('main');
	});

	it('still names the release branch when there is one', () => {
		const both = policyFor({
			profile: 'shared-checkout-merge',
			branches: { integration: 'develop', release: 'main' },
		});
		expect(servedWorkModelLines(both).join('\n')).toContain(
			'integration branch develop, release branch main',
		);
	});
});

describe('consumers of the release branch', () => {
	it('lists the shared branch once in the namespaces the guard allows', () => {
		const policy = policyFor({
			profile: 'shared-checkout-merge',
			branches: { integration: 'main', release: 'main' },
		});
		expect(policyNamespaces(policy).exact).toEqual(['main']);
	});

	it('writes one protection rule for the shared branch', () => {
		const desired = buildDesiredState(
			policyFor({
				profile: 'shared-checkout-pr',
				branches: { integration: 'main', release: 'main' },
				integration: { requiredChecks: ['verify'] },
			}),
		);
		expect(desired.branches.map((rule) => rule.branch)).toEqual(['main']);
		expect(desired.branches[0]?.role).toBe('integration');
	});

	it('does not treat the integration branch as a forbidden release target', () => {
		const merge = policyFor({
			profile: 'shared-checkout-merge',
			branches: { integration: 'main' },
		});
		// Landing is a merge performed by the engine, and a person or the
		// engine pushing the shared branch is never refused as a "release".
		expect(
			judgeGitOperation(
				merge,
				{ kind: 'push', remoteRef: 'refs/heads/main', deleting: false },
				AGENT,
			).refused,
		).toBe(false);
	});

	it('routes a pull-request project through main exactly as it would develop', () => {
		const pr = policyFor({
			profile: 'shared-checkout-pr',
			branches: { integration: 'main' },
			integration: { requiredChecks: ['verify'] },
		});
		const verdict = judgeGitOperation(
			pr,
			{ kind: 'push', remoteRef: 'refs/heads/main', deleting: false },
			AGENT,
		);
		expect(verdict.refused).toBe(true);
		expect(verdict).toMatchObject({
			reason: expect.stringContaining('through pull requests'),
		});
	});
});
