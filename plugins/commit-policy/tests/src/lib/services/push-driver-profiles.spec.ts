/**
 * push-driver-profiles.spec.ts
 *
 * The push driver enforces and describes the CONFIGURED profile: the
 * remedy of a refusal is the profile's own, and the protected branches
 * come from `branches.release` / `branches.integration`, never from the
 * names this repository happens to use.
 */

import { describe, expect, it } from 'vitest';

import type { IGitRunner, IGitRunResult } from '@delendai/core/contracts';

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

const policyFor = (development: Record<string, unknown>) =>
	resolveDevelopmentPolicy({ development });

const openPush = (overrides: Partial<ICommitPolicyPush> = {}) =>
	basePush({ protectedBranches: [], ...overrides });

const refusalOf = async (
	branch: string,
	development: ReturnType<typeof policyFor> | undefined,
) => {
	const { run, pushes } = buildPushFake();
	const result = await runPushDriver(
		{ remote: 'origin', branch },
		openPush(),
		run,
		development,
	);
	return { result, pushes };
};

describe('runPushDriver — the remedy belongs to the profile', () => {
	it('names merging, and no pull request, under shared-checkout-merge', async () => {
		const { result, pushes } = await refusalOf(
			'develop',
			policyFor({ profile: 'shared-checkout-merge' }),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe('DIRECT_PUSH_TO_INTEGRATION_NOT_ALLOWED');
		expect(result.refusal).toContain('shared-checkout-merge');
		expect(result.refusal).toContain('MERGING');
		expect(result.refusal).not.toMatch(/open a pull request/iu);
		expect(pushes.count).toBe(0);
	});

	it('names the pull request under shared-checkout-pr', async () => {
		const { result } = await refusalOf(
			'develop',
			policyFor({
				profile: 'shared-checkout-pr',
				integration: { requiredChecks: ['verify'] },
			}),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.refusal).toContain('shared-checkout-pr');
		expect(result.refusal).toMatch(/pull request/iu);
	});
});

describe('runPushDriver — the release branch comes from the policy', () => {
	const twoBranches = (profile: string) =>
		policyFor({
			profile,
			branches: { integration: 'trunk', release: 'stable' },
			integration: { requiredChecks: ['verify'] },
		});

	it('refuses a direct push to the declared release branch', async () => {
		const { result, pushes } = await refusalOf(
			'stable',
			twoBranches('shared-direct'),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe('DIRECT_PUSH_TO_RELEASE_NOT_ALLOWED');
		expect(result.refusal).toContain("'stable'");
		expect(pushes.count).toBe(0);
	});

	it('does not treat a branch called main as special when it is not the release branch', async () => {
		const { result } = await refusalOf(
			'main',
			twoBranches('shared-direct'),
		);

		expect(result.ok).toBe(true);
	});

	it('lets shared-direct push to an integration branch called main', async () => {
		const { result, pushes } = await refusalOf(
			'main',
			policyFor({
				profile: 'shared-direct',
				branches: { integration: 'main', release: 'main' },
			}),
		);

		expect(result.ok).toBe(true);
		expect(pushes.count).toBe(1);
	});

	it('lets a project with no release branch push its integration branch directly', async () => {
		const { result } = await refusalOf(
			'main',
			policyFor({
				profile: 'shared-direct',
				branches: { integration: 'main', release: '' },
			}),
		);

		expect(result.ok).toBe(true);
	});

	it('applies the integration rules when release and integration are one branch', async () => {
		const { result } = await refusalOf(
			'main',
			policyFor({
				profile: 'shared-checkout-merge',
				branches: { integration: 'main', release: 'main' },
			}),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe('DIRECT_PUSH_TO_INTEGRATION_NOT_ALLOWED');
	});

	it('protects the release branch ahead of any protectedBranches override', async () => {
		const { run } = buildPushFake();
		const result = await runPushDriver(
			{ remote: 'origin', branch: 'stable' },
			openPush({ protectedBranches: [] }),
			run,
			twoBranches('shared-checkout-merge'),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe('DIRECT_PUSH_TO_RELEASE_NOT_ALLOWED');
	});
});
