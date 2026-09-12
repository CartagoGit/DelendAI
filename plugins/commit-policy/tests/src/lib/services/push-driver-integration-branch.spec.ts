/**
 * push-driver-integration-branch.spec.ts
 *
 * The accident of 2026-09-09, turned into an invariant, in its own file
 * so it is findable by name rather than buried in the engine's general
 * coverage. Same fake-git pattern as `push-driver.spec.ts`.
 */

import { describe, expect, it } from 'vitest';

import type { IGitRunner, IGitRunResult } from '@delendai/core/public';

import type { ICommitPolicyPush } from '@delendai/commit-policy/lib/contracts/options';
import { runPushDriver } from '@delendai/commit-policy/lib/services/push-driver';
import { resolveDevelopmentPolicy } from '@delendai/core/public';

const ok = (output: string): IGitRunResult => ({ ok: true, output });

const buildPushFake = (
	opts: {
		currentBranch?: string;
		upstream?: { remote: string; branch: string };
	} = {},
): {
	run: IGitRunner;
	pushes: { count: number; calls: readonly (readonly string[])[] };
} => {
	const pushes = { count: 0, calls: [] as (readonly string[])[] };
	const responses = new Map<string, IGitRunResult>();
	if (opts.currentBranch !== undefined) {
		responses.set(
			'rev-parse\u0000--abbrev-ref\u0000HEAD',
			ok(`${opts.currentBranch}\n`),
		);
	}
	if (opts.upstream !== undefined) {
		responses.set(
			'rev-parse\u0000--abbrev-ref\u0000@{upstream}',
			ok(`${opts.upstream.remote}/${opts.upstream.branch}\n`),
		);
	}
	const run: IGitRunner = async (args) => {
		const key = args.join('\u0000');
		if (args[0] === 'push') {
			pushes.count += 1;
			pushes.calls.push([...args]);
			return ok('pushed\n');
		}
		const direct = responses.get(key);
		if (direct !== undefined) return direct;
		return { ok: false, output: '', reason: `not stubbed: ${key}` };
	};
	return { run, pushes };
};

const basePush = (
	overrides: Partial<ICommitPolicyPush> = {},
): ICommitPolicyPush => ({
	enabled: true,
	onCommit: false,
	force: 'with-lease',
	protectedBranches: ['main', 'master'],
	protectedPrefixes: [],
	...overrides,
});

/**
 * The accident of 2026-09-09, turned into an invariant.
 *
 * A background agent on the interval cadence committed an unrelated
 * working-tree edit and pushed it straight to `develop` — no pull
 * request, no CI, no review. Nothing in the running path refused it.
 * These specs are the reason it cannot happen again once a project
 * selects a pull-request policy, and the reason a project that did NOT
 * select one keeps working exactly as before.
 */
describe('runPushDriver — the integration branch under a policy', () => {
	const policyFor = (development: Record<string, unknown>) =>
		resolveDevelopmentPolicy({ development });

	const prPolicy = () =>
		policyFor({
			profile: 'shared-checkout-pr',
			integration: { requiredChecks: ['delendai-validate'] },
		});

	it('refuses a direct push to develop under a pull-request policy', async () => {
		const { run, pushes } = buildPushFake();

		const result = await runPushDriver(
			{ remote: 'origin', branch: 'develop' },
			basePush(),
			run,
			prPolicy(),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe('DIRECT_PUSH_TO_INTEGRATION_NOT_ALLOWED');
		// Refused BEFORE git ran, not reported after the damage.
		expect(pushes.count).toBe(0);
	});

	it('refuses it on the automatic path too, where the accident happened', async () => {
		// The scheduler resolves the branch from config rather than from
		// an explicit argument. That is the path that pushed by itself.
		const { run, pushes } = buildPushFake();

		const result = await runPushDriver(
			{},
			basePush({ branch: 'develop', remote: 'origin' }),
			run,
			prPolicy(),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe('DIRECT_PUSH_TO_INTEGRATION_NOT_ALLOWED');
		expect(pushes.count).toBe(0);
	});

	it('follows the POLICY, not the name "develop"', async () => {
		// A project whose integration branch is `trunk` is protected;
		// its `develop`, which is just another branch there, is not.
		const trunk = policyFor({
			profile: 'shared-checkout-pr',
			branches: { integration: 'trunk', release: 'stable' },
			integration: { requiredChecks: ['verify'] },
		});
		const { run } = buildPushFake();

		const refused = await runPushDriver(
			{ remote: 'origin', branch: 'trunk' },
			basePush(),
			run,
			trunk,
		);
		const allowed = await runPushDriver(
			{ remote: 'origin', branch: 'develop' },
			basePush(),
			run,
			trunk,
		);

		expect(refused.ok).toBe(false);
		expect(allowed.ok).toBe(true);
	});

	it('leaves a direct-integration project pushing exactly as before', async () => {
		// The old model is still legitimate. Breaking it would make this
		// guard a breaking change for every existing adopter.
		const { run, pushes } = buildPushFake();

		const result = await runPushDriver(
			{ remote: 'origin', branch: 'develop' },
			basePush(),
			run,
			policyFor({ profile: 'shared-direct' }),
		);

		expect(result.ok).toBe(true);
		expect(pushes.count).toBe(1);
	});

	it('still allows a work ref under a pull-request policy', async () => {
		// Refusing the integration branch must not refuse the very
		// branches the new model pushes to.
		const { run, pushes } = buildPushFake();

		const result = await runPushDriver(
			{ remote: 'origin', branch: 'wip/agent/p1-s1-g1' },
			basePush(),
			run,
			prPolicy(),
		);

		expect(result.ok).toBe(true);
		expect(pushes.count).toBe(1);
	});

	it('keeps refusing main even with no policy resolved at all', async () => {
		const { run } = buildPushFake();
		const result = await runPushDriver(
			{ remote: 'origin', branch: 'main' },
			basePush(),
			run,
			undefined,
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe('DIRECT_PUSH_TO_MAIN_NOT_ALLOWED');
	});
});
