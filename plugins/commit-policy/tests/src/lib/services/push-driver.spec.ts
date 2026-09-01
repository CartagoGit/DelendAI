/**
 * push-driver.spec.ts — exhaustive coverage for the push engine.
 *
 * Same fake-git pattern as commit-driver.spec.ts.
 */

import { describe, expect, it } from 'vitest';

import type { IGitRunner, IGitRunResult } from '@mcp-vertex/core/public';

import type { ICommitPolicyPush } from '@mcp-vertex/commit-policy/lib/contracts/options';
import { runPushDriver } from '@mcp-vertex/commit-policy/lib/services/push-driver';

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

describe('runPushDriver', () => {
	it('refuses when push.enabled is false', async () => {
		const { run } = buildPushFake({ currentBranch: 'topic/test' });
		const result = await runPushDriver(
			{},
			basePush({ enabled: false }),
			run,
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.refusal).toContain('push.enabled');
	});

	it('refuses direct push to main when protectedBranches includes it', async () => {
		const { run } = buildPushFake();
		const result = await runPushDriver(
			{ remote: 'origin', branch: 'main' },
			basePush(),
			run,
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		// x00272 (Track A): direct push to `main` is hard-blocked BEFORE
		// the protectedBranches override check, so the refusal codes as
		// DIRECT_PUSH_TO_MAIN_NOT_ALLOWED (a defense-in-depth layer that
		// no config override can enable).
		expect(result.code).toBe('DIRECT_PUSH_TO_MAIN_NOT_ALLOWED');
		expect(result.refusal).toContain(
			"direct push to 'main' is not allowed",
		);
	});

	it('refuses direct push to master when protectedBranches includes it', async () => {
		const { run, pushes } = buildPushFake();
		const result = await runPushDriver(
			{ remote: 'origin', branch: 'master' },
			basePush(),
			run,
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.refusal).toContain('BRANCH_PROTECTED');
		expect(result.refusal).toContain('branch "master" matches policy');
		expect(pushes.calls.length).toBe(0);
	});

	it('uses the configured remote + branch when no override is passed', async () => {
		const { run, pushes } = buildPushFake();
		const result = await runPushDriver(
			{},
			basePush({
				remote: 'origin',
				branch: 'topic/test',
			}),
			run,
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.remote).toBe('origin');
		expect(result.branch).toBe('topic/test');
		expect(pushes.calls[0]).toEqual([
			'push',
			'origin',
			'HEAD:topic/test',
			'--force-with-lease',
		]);
	});

	it('uses the upstream when remote+branch are not configured', async () => {
		const { run, pushes } = buildPushFake({
			upstream: { remote: 'origin', branch: 'topic/test' },
		});
		const result = await runPushDriver({}, basePush(), run);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.remote).toBe('origin');
		expect(result.branch).toBe('topic/test');
		expect(pushes.calls[0]).toEqual([
			'push',
			'origin',
			'HEAD:topic/test',
			'--force-with-lease',
		]);
	});

	it('falls back to the current branch when nothing else is resolvable', async () => {
		const { run, pushes } = buildPushFake({ currentBranch: 'topic/test' });
		const result = await runPushDriver(
			{},
			basePush({ remote: 'origin' }),
			run,
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.branch).toBe('topic/test');
		expect(pushes.calls[0]).toEqual([
			'push',
			'origin',
			'HEAD:topic/test',
			'--force-with-lease',
		]);
	});

	it('omits --force when force policy is "never"', async () => {
		const { run, pushes } = buildPushFake();
		await runPushDriver(
			{},
			basePush({
				force: 'never',
				remote: 'origin',
				branch: 'topic/test',
			}),
			run,
		);
		expect(pushes.calls[0]).toEqual(['push', 'origin', 'HEAD:topic/test']);
	});

	it('uses --force when force policy is "allow" and the push is authorized', async () => {
		const { run, pushes } = buildPushFake();
		const result = await runPushDriver(
			{ authorizedBy: 'Release Bot' },
			basePush({
				force: 'allow',
				forceReason: 'rewriting a leaked secret out of history',
				remote: 'origin',
				branch: 'topic/test',
			}),
			run,
		);
		expect(result.ok).toBe(true);
		expect(pushes.calls[0]).toEqual([
			'push',
			'origin',
			'HEAD:topic/test',
			'--force',
		]);
	});

	it('refuses "allow" when push.forceReason is not configured', async () => {
		const { run, pushes } = buildPushFake();
		const result = await runPushDriver(
			{ authorizedBy: 'Release Bot' },
			basePush({
				force: 'allow',
				remote: 'origin',
				branch: 'topic/test',
			}),
			run,
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.refusal).toContain('push.forceReason');
		expect(pushes.calls.length).toBe(0);
	});

	it('refuses "allow" when no identity could be resolved to authorize it', async () => {
		const { run, pushes } = buildPushFake();
		const result = await runPushDriver(
			{},
			basePush({
				force: 'allow',
				forceReason: 'rewriting a leaked secret out of history',
				remote: 'origin',
				branch: 'topic/test',
			}),
			run,
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.refusal).toContain('identity');
		expect(pushes.calls.length).toBe(0);
	});

	it('refuses an authorized force push targeting main before protected branch policy', async () => {
		const { run, pushes } = buildPushFake();
		const result = await runPushDriver(
			{ authorizedBy: 'Release Bot' },
			basePush({
				force: 'allow',
				forceReason: 'rewriting a leaked secret out of history',
				remote: 'origin',
				branch: 'main',
			}),
			run,
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		// x00272 (Track A): even with an authorized force push, `main` is
		// hard-blocked before any other policy layer runs.
		expect(result.code).toBe('DIRECT_PUSH_TO_MAIN_NOT_ALLOWED');
		expect(pushes.calls.length).toBe(0);
	});

	it('allows master resolved from the current branch when protectedBranches is empty', async () => {
		const { run, pushes } = buildPushFake({ currentBranch: 'master' });
		const result = await runPushDriver(
			{},
			basePush({ remote: 'origin', protectedBranches: [] }),
			run,
		);
		expect(result.ok).toBe(true);
		expect(pushes.calls.length).toBe(1);
	});

	it('refuses direct push to main even when protectedBranches is empty (x00272)', async () => {
		const { run, pushes } = buildPushFake({ currentBranch: 'main' });
		const result = await runPushDriver(
			{},
			basePush({ remote: 'origin', protectedBranches: [] }),
			run,
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		// x00272 (Track A): direct push to `main` is hard-blocked regardless
		// of protectedBranches — config cannot re-enable the release path.
		expect(result.code).toBe('DIRECT_PUSH_TO_MAIN_NOT_ALLOWED');
		expect(pushes.calls.length).toBe(0);
	});

	it('allows direct push to develop when config omits it', async () => {
		const { run, pushes } = buildPushFake();
		const result = await runPushDriver(
			{},
			basePush({
				remote: 'origin',
				branch: 'develop',
			}),
			run,
		);
		expect(result.ok).toBe(true);
		expect(pushes.calls.length).toBe(1);
	});

	it('allows agent branches even if config tries to protect them explicitly', async () => {
		const { run, pushes } = buildPushFake();
		const result = await runPushDriver(
			{},
			basePush({
				remote: 'origin',
				branch: 'agent/cp-branch-policy-worker-r2',
				protectedBranches: ['agent/cp-branch-policy-worker-r2'],
			}),
			run,
		);
		expect(result.ok).toBe(true);
		expect(pushes.calls.length).toBe(1);
	});

	it('allows direct push to release branches outside the main-only guard', async () => {
		const { run, pushes } = buildPushFake();
		const result = await runPushDriver(
			{},
			basePush({
				remote: 'origin',
				branch: 'release/0.4.0',
				protectedBranches: [],
			}),
			run,
		);
		expect(result.ok).toBe(true);
		expect(pushes.calls.length).toBe(1);
	});

	it('refuses direct push to develop when config marks it protected', async () => {
		const { run, pushes } = buildPushFake();
		const result = await runPushDriver(
			{},
			basePush({
				remote: 'origin',
				branch: 'develop',
				protectedBranches: ['main', 'master', 'develop'],
			}),
			run,
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.refusal).toContain('BRANCH_PROTECTED');
		expect(pushes.calls.length).toBe(0);
	});

	it('refuses when neither remote/branch/upstream/current-branch resolves', async () => {
		const { run } = buildPushFake(); // no currentBranch, no upstream
		const result = await runPushDriver({}, basePush(), run);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.refusal).toContain('remote/branch');
	});
});
