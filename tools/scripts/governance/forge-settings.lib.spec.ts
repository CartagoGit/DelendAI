/**
 * forge-settings.lib.spec.ts — the projection must follow the policy, and
 * must produce a genuinely different document for a project that chose a
 * different model. A generator that emits pull-request rules regardless of
 * the policy would just be a sixth source of truth.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

import {
	branchProtectionDocument,
	integrationBranchDocument,
	releaseBranchDocument,
	settingsDocument,
} from './forge-settings.lib';

const policyFor = (development: Record<string, unknown>) =>
	resolveDevelopmentPolicy({ development });

describe('forge settings projection', () => {
	it('protects the integration branch under a pull-request policy', () => {
		const policy = policyFor({
			profile: 'shared-checkout-pr',
			branches: { integration: 'develop', release: 'main' },
			integration: { requiredChecks: ['delendai-validate'] },
		});
		const branch = integrationBranchDocument(policy);

		expect(branch.name).toBe('develop');
		expect(branch.protected).toBeUndefined();
		expect(branch.protection.required_status_checks).toEqual({
			strict: true,
			contexts: ['delendai-validate'],
		});
		expect(branch.protection.allow_force_pushes).toBe(false);
		expect(branch.protection.allow_deletions).toBe(false);
	});

	it('leaves the integration branch open under a direct policy', () => {
		// A project that chose direct integration must not have
		// pull-request rules applied to it.
		const policy = policyFor({ profile: 'shared-direct' });
		const branch = integrationBranchDocument(policy);

		expect(branch.protected).toBe(false);
		expect(branch.protection.required_status_checks.contexts).toEqual([]);
	});

	it('derives the branch names from the policy, never from a constant', () => {
		const policy = policyFor({
			profile: 'shared-checkout-pr',
			branches: { integration: 'trunk', release: 'stable' },
			integration: { requiredChecks: ['verify'] },
		});

		expect(integrationBranchDocument(policy).name).toBe('trunk');
		expect(releaseBranchDocument(policy).name).toBe('stable');
	});

	it('keeps the release branch at least as strict as integration', () => {
		const policy = policyFor({ profile: 'shared-direct' });
		const release = releaseBranchDocument(policy).protection;
		const integration = integrationBranchDocument(policy).protection;

		// Integration is deliberately open here; release must not be.
		expect(release.enforce_admins).toBe(true);
		expect(release.required_status_checks.strict).toBe(true);
		expect(integration.enforce_admins).toBe(false);
		expect(release.allow_force_pushes).toBe(false);
		expect(release.allow_deletions).toBe(false);
	});

	it('never emits a required check the policy did not name', () => {
		// `ci-complete` was required on main for months while no workflow
		// produced it, so main could never merge. A projection cannot
		// invent a context.
		const policy = policyFor({
			profile: 'shared-checkout-pr',
			integration: { requiredChecks: ['delendai-validate'] },
		});

		for (const branch of branchProtectionDocument(policy).branches) {
			expect(branch.protection.required_status_checks.contexts).not.toContain(
				'ci-complete',
			);
		}
	});

	it('describes both branches in branch-protection, release first', () => {
		const policy = policyFor({
			profile: 'shared-checkout-pr',
			integration: { requiredChecks: ['delendai-validate'] },
		});
		const document = branchProtectionDocument(policy);

		expect(document.version).toBe(1);
		expect(document.branches.map((branch) => branch.name)).toEqual([
			'main',
			'develop',
		]);
	});

	it('describes only the integration branch in settings', () => {
		const policy = policyFor({
			profile: 'shared-checkout-pr',
			integration: { requiredChecks: ['delendai-validate'] },
		});

		expect(settingsDocument(policy).branches.map((b) => b.name)).toEqual([
			'develop',
		]);
	});
});
