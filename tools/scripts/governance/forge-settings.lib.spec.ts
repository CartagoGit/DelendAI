/**
 * forge-settings.lib.spec.ts — the projection must follow the policy, and
 * must produce a genuinely different document for a project that chose a
 * different model. A generator that emits pull-request rules regardless of
 * the policy would just be a sixth source of truth.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import {
	branchProtectionDocument,
	integrationBranchDocument,
	releaseBranchDocument,
	namespaceRuleset,
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
		// `strict: false` is the load-bearing half of this assertion.
		// With it true, every merge makes every other open candidate
		// stale, so landing N candidates costs N CI cycles: measured
		// here as six green pull requests and none mergeable. The
		// up-to-date proof lives in `forge:publish` instead, which does
		// it in ~4s against the candidate itself.
		expect(branch.protection.required_status_checks).toEqual({
			strict: false,
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
			expect(
				branch.protection.required_status_checks.contexts,
			).not.toContain('ci-complete');
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

	it('declares pull-request review with the policy approval counts', () => {
		// The property the two committed files disagreed about while the
		// live repository did a third thing. Projecting it means a
		// reviewer can see PR-required follows from the strategy, and
		// nobody can drift it by editing YAML.
		const policy = policyFor({
			profile: 'shared-checkout-pr',
			integration: {
				requiredChecks: ['delendai-validate'],
				requiredApprovals: 0,
				releaseRequiredApprovals: 1,
			},
		});

		expect(
			integrationBranchDocument(policy).protection
				.required_pull_request_reviews,
		).toEqual({ required_approving_review_count: 0 });
		expect(
			releaseBranchDocument(policy).protection
				.required_pull_request_reviews,
		).toEqual({ required_approving_review_count: 1 });
	});

	it('asks for no review at all when integration is direct', () => {
		const policy = policyFor({ profile: 'shared-direct' });
		expect(
			integrationBranchDocument(policy).protection
				.required_pull_request_reviews,
		).toBeNull();
	});

	it('lets the release branch require checks integration does not', () => {
		// A version gate or a publish dry-run has no meaning on a
		// day-to-day merge; folding it into one list would force every
		// candidate to satisfy it.
		const policy = policyFor({
			profile: 'shared-checkout-pr',
			integration: {
				requiredChecks: ['delendai-validate'],
				releaseRequiredChecks: ['delendai-validate', 'release-pr-gate'],
			},
		});

		expect(
			integrationBranchDocument(policy).protection.required_status_checks
				.contexts,
		).toEqual(['delendai-validate']);
		expect(
			releaseBranchDocument(policy).protection.required_status_checks
				.contexts,
		).toEqual(['delendai-validate', 'release-pr-gate']);
	});

	it('falls back to the integration checks when release names none', () => {
		const policy = policyFor({
			profile: 'shared-checkout-pr',
			integration: { requiredChecks: ['verify'] },
		});
		expect(
			releaseBranchDocument(policy).protection.required_status_checks
				.contexts,
		).toEqual(['verify']);
	});
});

/**
 * A projection that omits a property the checker reads is a
 * disagreement nothing can resolve.
 *
 * The runtime's desired state has always asked for conversation
 * resolution on the release branch. This projection did not carry the
 * field at all, so whatever applied the YAML could never satisfy the
 * reconciler, and every startup reported
 * `governance.drift (branch.main.requireConversationResolution)` —
 * forever, because applying the projection could not change the answer.
 */
describe('required_conversation_resolution is projected at all', () => {
	const policy = policyFor({
		profile: 'shared-checkout-pr',
		integration: { requiredChecks: ['delendai-validate'] },
	});

	it('asks for it on the release branch', () => {
		expect(
			releaseBranchDocument(policy).protection
				.required_conversation_resolution,
		).toBe(true);
	});

	it('does not ask for it on the integration branch', () => {
		expect(
			integrationBranchDocument(policy).protection
				.required_conversation_resolution,
		).toBe(false);
	});

	// The point is that the field EXISTS in the document, not what it
	// says: an absent property and a `false` one are the same YAML to a
	// reader and completely different to the thing applying it.
	it('emits the property even when it is false', () => {
		expect(
			Object.hasOwn(
				integrationBranchDocument(policy).protection,
				'required_conversation_resolution',
			),
		).toBe(true);
	});
});

describe('namespaceRuleset depth (x00568 S2)', () => {
	const policy = policyFor({
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai', integration: 'develop' },
	});
	const exclude = (
		namespaceRuleset(policy) as {
			conditions: { ref_name: { exclude: readonly string[] } };
		}
	).conditions.ref_name.exclude;

	it('allows a publication ref as deep as the work ref it came from', () => {
		// The canonical publication ref is
		// `delendai/pr/{agent}/{proposal}-{slice}-g{n}/{topic}`. A `**`
		// pattern matches one segment, so the forge declined exactly that
		// name and accepted only flat ones.
		expect(exclude).toContain('refs/heads/delendai/pr/**/*');
		expect(exclude).not.toContain('refs/heads/delendai/pr/**');
	});

	it('gives work and publication the same depth', () => {
		const work = exclude.filter((p) => p.includes('/wip/'));
		const publication = exclude.filter((p) => p.includes('/pr/'));
		expect(work).toHaveLength(1);
		expect(publication).toHaveLength(1);
		expect(publication[0]?.replace('/pr/', '/wip/')).toBe(work[0]);
	});

	it('follows the namespace the project configured', () => {
		const acme = policyFor({
			profile: 'shared-checkout-pr',
			branches: { namespacePrefix: 'acme' },
		});
		const theirs = (
			namespaceRuleset(acme) as {
				conditions: { ref_name: { exclude: readonly string[] } };
			}
		).conditions.ref_name.exclude;
		expect(theirs).toContain('refs/heads/acme/pr/**/*');
	});
});
