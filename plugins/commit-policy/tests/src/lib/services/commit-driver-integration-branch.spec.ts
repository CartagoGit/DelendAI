/**
 * commit-driver-integration-branch.spec.ts
 *
 * The other half of the rule that `push-driver-integration-branch.spec.ts`
 * has held since 2026-09-09, in its own file for the same reason: it is
 * findable by name.
 *
 * The push side refused a direct push to the integration branch. The
 * commit side never asked, because this driver did not receive the
 * development policy at all — and this driver is what the interval sweep
 * runs. Half a rule turned out to be worse than none: every few minutes
 * the sweep committed whatever was dirty onto the integration branch, the
 * push was then correctly refused, and the work sat in local commits that
 * nothing would ever publish. It looked saved and was stranded.
 */

import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { runCommitDriver } from '@delendai/commit-policy/lib/services/commit-driver';

import { basePolicy, buildFakeGit } from './commit-driver-harness';

const policyFor = (development: Record<string, unknown>) =>
	resolveDevelopmentPolicy({ development });

const prPolicy = () =>
	policyFor({
		profile: 'shared-checkout-pr',
		integration: { requiredChecks: ['delendai-validate'] },
	});

const runOn = async (
	branch: string,
	development?: ReturnType<typeof resolveDevelopmentPolicy>,
) => {
	const fake = buildFakeGit({
		currentBranch: branch,
		globalName: 'Cartago',
		globalEmail: 'cartago@example.com',
	});
	const result = await runCommitDriver(
		{ message: 'chore: update something.ts' },
		{
			run: fake.run,
			policy: basePolicy(),
			identityCtx: { run: fake.run, envVars: Object.freeze({}) },
			auditAgent: null,
			...(development === undefined ? {} : { development }),
		},
	);
	return { result, fake };
};

describe('runCommitDriver — the integration branch under a policy', () => {
	it('refuses to commit onto the integration branch, before git runs', async () => {
		const { result, fake } = await runOn('develop', prPolicy());

		expect(result.committed).toBe(false);
		expect(result.refusal).toContain(
			'DIRECT_COMMIT_TO_INTEGRATION_NOT_ALLOWED',
		);
		// Refused BEFORE the commit exists, not reported after it does.
		expect(fake.committed.count).toBe(0);
	});

	it('says why the commit would strand the work, not just that it is refused', async () => {
		// An agent told only "refused" invents a workaround. The refusal
		// has to explain that the push is refused too, so committing here
		// produces work nothing can ever publish.
		const { result } = await runOn('develop', prPolicy());
		expect(result.refusal).toContain('stays in the tree');
		expect(result.refusal).toContain('could never be published');
	});

	it('follows the POLICY, not the name "develop"', async () => {
		const trunk = policyFor({
			profile: 'shared-checkout-pr',
			branches: { integration: 'trunk', release: 'stable' },
			integration: { requiredChecks: ['verify'] },
		});

		expect((await runOn('trunk', trunk)).result.committed).toBe(false);
		// `develop` is just another branch in that project.
		expect(
			(await runOn('develop', trunk)).result.refusal ?? '',
		).not.toContain('DIRECT_COMMIT_TO_INTEGRATION_NOT_ALLOWED');
	});

	it('leaves a workspace with no development policy exactly as it was', async () => {
		// A project that never stated a policy predates this contract and
		// must keep its historical behaviour; `undefined` is a real state.
		const { result } = await runOn('develop');
		expect(result.refusal ?? '').not.toContain(
			'DIRECT_COMMIT_TO_INTEGRATION_NOT_ALLOWED',
		);
	});

	it('still allows committing on a work branch under the same policy', async () => {
		const { result } = await runOn('delendai/pr/some-slice', prPolicy());
		expect(result.refusal ?? '').not.toContain(
			'DIRECT_COMMIT_TO_INTEGRATION_NOT_ALLOWED',
		);
	});

	it('allows it when the policy says direct commits are the model', async () => {
		const direct = policyFor({ profile: 'shared-direct' });
		const { result } = await runOn('develop', direct);
		expect(result.refusal ?? '').not.toContain(
			'DIRECT_COMMIT_TO_INTEGRATION_NOT_ALLOWED',
		);
	});
});
