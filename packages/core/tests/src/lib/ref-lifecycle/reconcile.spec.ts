/**
 * classify.spec.ts — every branch in the repository gets a verdict, and
 * the two wrong states are kept apart because only one of them is safe
 * to fix automatically.
 *
 * This is written against a real incident: a slice was developed on
 * `feat/sqlite-revision-cas`, pushed, and left with no pull request. One
 * such branch is untidy; the pattern is a repository nobody can read.
 * Every case below is a state that actually occurred.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import { reconcileRefs } from '@delendai/core/lib/ref-lifecycle/reconcile.service';
import type { IObservedPullRequest } from '@delendai/core/lib/ref-lifecycle/reconcile.service';

const { branches } = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		integration: { requiredChecks: ['delendai-validate'] },
	},
});

const refs = (...names: readonly string[]) =>
	names.map((name) => ({ name }));

const pr = (
	number: number,
	headRefName: string,
	state: IObservedPullRequest['state'],
): IObservedPullRequest => ({ number, headRefName, state });

const roleOf = (
	name: string,
	pullRequests: readonly IObservedPullRequest[] = [],
) =>
	reconcileRefs(refs(name), pullRequests, branches).verdicts[0]?.role;

describe('reconcileRefs', () => {
	it('never treats the integration or release branch as an agent’s', () => {
		expect(roleOf(branches.integration)).toBe('protected');
		expect(roleOf(branches.release)).toBe('protected');
	});

	it('recognises a publication ref doing its job', () => {
		expect(
			roleOf('delendai/pr/policy-anchor', [
				pr(71, 'delendai/pr/policy-anchor', 'open'),
			]),
		).toBe('publication-open');
	});

	it('calls a branch outside every namespace what it is', () => {
		// The exact shape of the incident: work developed on a feature
		// branch under a model where agents own work, not branches.
		const verdict = reconcileRefs(
			refs('feat/sqlite-revision-cas'),
			[],
			branches,
		).verdicts[0];
		expect(verdict?.role).toBe('unmanaged');
		expect(verdict?.reason).toContain('agent owns work, not a branch');
	});

	it('flags an unmanaged branch even when it has an open pull request', () => {
		// A pull request makes the work reviewable; it does not make the
		// branch a legitimate place to have developed it.
		expect(
			roleOf('feat/whatever', [pr(1, 'feat/whatever', 'open')]),
		).toBe('unmanaged');
	});

	it('separates work that may be deleted from work that must not be', () => {
		const result = reconcileRefs(
			refs(
				branches.integration,
				'delendai/pr/merged-slice',
				'delendai/pr/no-request',
				'feat/somebodys-branch',
				'dependabot/npm_and_yarn/vitest-4',
			),
			[pr(70, 'delendai/pr/merged-slice', 'merged')],
			branches,
		);

		// Deleting a ref whose pull request merged loses nothing: the
		// content is provably in the integration branch.
		expect(result.reapable.map((v) => v.name)).toEqual([
			'delendai/pr/merged-slice',
		]);

		// These two are equally wrong and NOT equally safe. A ref with no
		// pull request may be the only copy of work somebody is holding,
		// so it is reported, never reaped.
		expect(result.needsAttention.map((v) => v.name).sort()).toEqual([
			'delendai/pr/no-request',
			'feat/somebodys-branch',
		]);
	});

	it('never reaps a branch delendai does not own', () => {
		const result = reconcileRefs(
			refs('dependabot/npm_and_yarn/vitest-4'),
			[],
			branches,
		);
		expect(result.verdicts[0]?.role).toBe('foreign');
		expect(result.reapable).toEqual([]);
		expect(result.needsAttention).toEqual([]);
	});

	it('lets a reopened pull request outrank an older closed one', () => {
		// Otherwise a ref that is actively under review again would be
		// classified as spent and offered up for deletion.
		expect(
			roleOf('delendai/pr/slice', [
				pr(70, 'delendai/pr/slice', 'closed'),
				pr(72, 'delendai/pr/slice', 'open'),
			]),
		).toBe('publication-open');
	});

	it('carries the pull request number into the verdict', () => {
		// A verdict an operator cannot check is a verdict they have to
		// take on trust.
		const verdict = reconcileRefs(
			refs('delendai/pr/slice'),
			[pr(70, 'delendai/pr/slice', 'merged')],
			branches,
		).verdicts[0];
		expect(verdict?.pullRequest).toBe(70);
	});
});
