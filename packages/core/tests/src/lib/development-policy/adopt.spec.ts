/**
 * adopt.spec.ts — a project that has never stated a development model
 * gets the one that matches what it actually is, and can audit why.
 *
 * The cases that matter are the ones where guessing generously would be
 * harmful: a forge nobody administers, a capability nobody could check,
 * and a decision somebody already made.
 */
import { describe, expect, it } from 'vitest';

import { proposeAdoption } from '@delendai/core/lib/development-policy/adopt';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import { validateDevelopmentPolicy } from '@delendai/core/lib/development-policy/validate';

const propose = (evidence: Parameters<typeof proposeAdoption>[0]) =>
	proposeAdoption(evidence);

describe('proposeAdoption', () => {
	it('never overwrites a project that already decided', () => {
		const proposal = propose({ hasDevelopmentBlock: true, forge: 'github' });
		expect(proposal.block).toBeUndefined();
		expect(proposal.reasons[0]).toContain('already states');
	});

	it('gives a GitHub project that can require checks the pull-request model', () => {
		const proposal = propose({
			hasDevelopmentBlock: false,
			forge: 'github',
			canRequireChecks: true,
			currentBranch: 'develop',
			existingBranches: ['develop', 'main'],
		});
		expect(proposal.block?.['profile']).toBe('shared-checkout-pr');
		expect(proposal.block?.['branches']).toEqual({
			integration: 'develop',
			release: 'main',
		});
	});

	it('gives a forge it cannot administer the model that needs no pull request', () => {
		// The case this exists for: a GitLab instance where merge
		// requests are not the team's process and nobody holds the rights
		// to require a check.
		const proposal = propose({
			hasDevelopmentBlock: false,
			forge: 'gitlab',
			canRequireChecks: false,
			currentBranch: 'develop',
		});
		expect(proposal.block?.['profile']).toBe('shared-checkout-merge');
	});

	it('treats an unknown capability as "cannot", never as permission', () => {
		// Claiming a gate we may not hold is how this repository ended up
		// with a `main` that required a context no workflow produced.
		const proposal = propose({
			hasDevelopmentBlock: false,
			forge: 'github',
			currentBranch: 'develop',
		});
		expect(proposal.block?.['profile']).toBe('shared-checkout-merge');
		expect(proposal.reasons.join(' ')).toContain('Unknown is not permission');
	});

	it('keeps a worktree decision the project already made', () => {
		const proposal = propose({
			hasDevelopmentBlock: false,
			agentWorktree: true,
			forge: 'github',
			canRequireChecks: true,
			currentBranch: 'develop',
		});
		expect(proposal.block?.['profile']).toBe('worktree-pr');
	});

	it('integrates on the branch the workspace is actually working from', () => {
		// Deliberately not the forge's `default_branch`: what a forge
		// calls default has nothing to do with where a team integrates.
		const proposal = propose({
			hasDevelopmentBlock: false,
			forge: 'other',
			currentBranch: 'trabajo',
			existingBranches: ['trabajo', 'master'],
		});
		expect(proposal.block?.['branches']).toEqual({
			integration: 'trabajo',
			release: 'master',
		});
	});

	it('does not invent a release branch that does not exist', () => {
		const proposal = propose({
			hasDevelopmentBlock: false,
			forge: 'other',
			currentBranch: 'develop',
			existingBranches: ['develop'],
		});
		expect(
			(proposal.block?.['branches'] as Record<string, string>)['release'],
		).toBeUndefined();
		expect(proposal.reasons.join(' ')).toContain('no release branch');
	});

	it('proposes only blocks that actually resolve and validate', () => {
		// A migration that writes a config the runtime then refuses at
		// startup would leave the workspace worse than it found it.
		for (const evidence of [
			{ hasDevelopmentBlock: false, forge: 'gitlab' as const, currentBranch: 'develop' },
			{
				hasDevelopmentBlock: false,
				forge: 'github' as const,
				canRequireChecks: true,
				currentBranch: 'develop',
				existingBranches: ['develop', 'main'],
			},
			{ hasDevelopmentBlock: false, agentWorktree: true, forge: 'other' as const },
		]) {
			const block = propose(evidence).block;
			const policy = resolveDevelopmentPolicy({ development: block });
			const violations = validateDevelopmentPolicy(policy).map(
				(v) => v.rule,
			);
			// The pull-request profiles legitimately demand that the
			// project name its own checks; everything else must be clean.
			expect(
				violations.filter(
					(rule) => rule !== 'enforced-governance-needs-checks',
				),
				JSON.stringify(evidence),
			).toEqual([]);
		}
	});

	it('explains every part of what it chose', () => {
		const proposal = propose({
			hasDevelopmentBlock: false,
			forge: 'gitlab',
			canRequireChecks: false,
			currentBranch: 'develop',
			existingBranches: ['develop', 'main'],
		});
		// An operator who cannot audit a migration has to trust it.
		expect(proposal.reasons.length).toBeGreaterThanOrEqual(3);
		expect(proposal.reasons.join(' ')).toContain('shared-checkout-merge');
	});
});
