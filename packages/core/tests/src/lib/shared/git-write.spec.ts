/**
 * f00082 — `git-write.ts` `--author=` plumbing contract.
 *
 * `gitCommit` and `commitAndPush` now thread `options.authorFlag` into
 * the `git commit` argv. The contract:
 *
 *   - omitted / empty   → no `--author=` flag (use git config — the
 *                         historical default).
 *   - whitespace-only   → also no flag (defensive: a buggy resolver
 *                         must NOT silently produce `git commit
 *                         --author=  -m …`).
 *   - any non-empty     → `--author=<value>` between `commit` and `-m`,
 *                         so `--amend` keeps its slot.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
	clearForcePushAuthorizationsForTests,
	commitAndPush,
	gitCommit,
	gitPush,
	listForcePushAuthorizations,
	type IGitRunResult,
	type IGitRunner,
} from '../../../../src/lib/shared/git-write';

const captureRunner = (
	results: readonly IGitRunResult[],
): { runner: IGitRunner; calls: readonly string[][] } => {
	const calls: string[][] = [];
	const queue = [...results];
	const runner: IGitRunner = (args) => {
		calls.push([...args]);
		const next = queue.shift();
		return Promise.resolve(next ?? { ok: true, output: '' });
	};
	return { runner, calls };
};

describe('gitCommit — author flag', () => {
	it('emits no --author flag when authorFlag is omitted', async () => {
		const { runner, calls } = captureRunner([{ ok: true, output: '' }]);
		await gitCommit(runner, 'feat: x');
		expect(calls[0]).toEqual(['commit', '-m', 'feat: x']);
	});

	it('emits no --author flag when authorFlag is empty', async () => {
		const { runner, calls } = captureRunner([{ ok: true, output: '' }]);
		await gitCommit(runner, 'feat: x', { authorFlag: '' });
		expect(calls[0]).toEqual(['commit', '-m', 'feat: x']);
	});

	it('emits no --author flag when authorFlag is whitespace-only', async () => {
		const { runner, calls } = captureRunner([{ ok: true, output: '' }]);
		await gitCommit(runner, 'feat: x', { authorFlag: '   ' });
		expect(calls[0]).toEqual(['commit', '-m', 'feat: x']);
	});

	it('emits --author=<flag> between commit and -m', async () => {
		const { runner, calls } = captureRunner([{ ok: true, output: '' }]);
		await gitCommit(runner, 'feat: x', {
			authorFlag: 'Ana <ana@example.com>',
		});
		expect(calls[0]).toEqual([
			'commit',
			'--author=Ana <ana@example.com>',
			'-m',
			'feat: x',
		]);
	});

	it('emits --author= BEFORE --amend, with -m last', async () => {
		const { runner, calls } = captureRunner([{ ok: true, output: '' }]);
		await gitCommit(runner, 'feat: x', {
			amend: true,
			authorFlag: 'Bot <bot@users.noreply.github.com>',
		});
		expect(calls[0]).toEqual([
			'commit',
			'--amend',
			'--author=Bot <bot@users.noreply.github.com>',
			'-m',
			'feat: x',
		]);
	});
});

describe('commitAndPush — author flag plumbing', () => {
	it('threads authorFlag through to gitCommit', async () => {
		const { runner, calls } = captureRunner([
			{ ok: true, output: '' }, // add
			{ ok: true, output: '' }, // commit
			{ ok: true, output: 'abc1234' }, // rev-parse
		]);
		const result = await commitAndPush({
			files: ['x.ts'],
			message: 'feat: x',
			git: runner,
			authorFlag: '"Cartago (M3)" <c@local>',
		});
		expect(result.committed).toBe(true);
		expect(result.hash).toBe('abc1234');
		expect(calls[1]).toEqual([
			'commit',
			'--author="Cartago (M3)" <c@local>',
			'-m',
			'feat: x',
		]);
	});

	it('omits --author when authorFlag is absent (default behaviour preserved)', async () => {
		const { runner, calls } = captureRunner([
			{ ok: true, output: '' },
			{ ok: true, output: '' },
			{ ok: true, output: 'abc1234' },
		]);
		await commitAndPush({
			files: ['x.ts'],
			message: 'feat: x',
			git: runner,
		});
		expect(calls[1]).toEqual(['commit', '-m', 'feat: x']);
	});
});

describe('gitPush — force authorization + protected-branch guard', () => {
	beforeEach(() => {
		clearForcePushAuthorizationsForTests();
	});

	it('force-with-lease still works with no authorization required', async () => {
		const { runner, calls } = captureRunner([{ ok: true, output: '' }]);
		const result = await gitPush(runner, {
			remote: 'origin',
			branch: 'agent/x',
			force: 'with-lease',
		});
		expect(result.ok).toBe(true);
		expect(calls[0]).toEqual([
			'push',
			'origin',
			'agent/x',
			'--force-with-lease',
		]);
		expect(listForcePushAuthorizations()).toHaveLength(0);
	});

	it('refuses plain force without authorization', async () => {
		const { runner, calls } = captureRunner([]);
		const result = await gitPush(runner, {
			remote: 'origin',
			branch: 'agent/x',
			force: 'true',
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toMatch(/plain --force refused/u);
		expect(calls).toHaveLength(0); // git is never invoked
		expect(listForcePushAuthorizations()).toHaveLength(0);
	});

	it('refuses plain force when authorization has an empty reason', async () => {
		const { runner } = captureRunner([]);
		const result = await gitPush(runner, {
			branch: 'agent/x',
			force: 'true',
			authorization: { by: 'agent-1', reason: '   ' },
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toMatch(/plain --force refused/u);
	});

	it('proceeds with plain force when authorization is supplied, and records it', async () => {
		const { runner, calls } = captureRunner([{ ok: true, output: '' }]);
		const result = await gitPush(runner, {
			remote: 'origin',
			branch: 'agent/x',
			force: 'true',
			authorization: {
				by: 'agent-1',
				reason: 'recover from a bad rebase',
			},
		});
		expect(result.ok).toBe(true);
		expect(calls[0]).toEqual(['push', 'origin', 'agent/x', '--force']);
		const recorded = listForcePushAuthorizations();
		expect(recorded).toHaveLength(1);
		expect(recorded[0]).toMatchObject({
			by: 'agent-1',
			reason: 'recover from a bad rebase',
			branch: 'agent/x',
			forceMode: 'true',
		});
	});

	it('refuses a force push (with-lease) against a protected branch without authorization', async () => {
		const { runner, calls } = captureRunner([]);
		const result = await gitPush(runner, {
			remote: 'origin',
			branch: 'develop',
			force: 'with-lease',
			protectedBranches: ['develop', 'main'],
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toMatch(/protected branch/u);
		expect(calls).toHaveLength(0);
	});

	it('refuses a force push against the resolved current branch when protected', async () => {
		const { runner, calls } = captureRunner([
			{ ok: true, output: 'develop\n' }, // rev-parse --abbrev-ref HEAD
		]);
		const result = await gitPush(runner, {
			force: 'with-lease',
			protectedBranches: ['develop'],
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toMatch(/"develop" is a protected branch/u);
		expect(calls[0]).toEqual(['rev-parse', '--abbrev-ref', 'HEAD']);
	});

	it('allows a force push against a protected branch when authorized', async () => {
		const { runner, calls } = captureRunner([{ ok: true, output: '' }]);
		const result = await gitPush(runner, {
			remote: 'origin',
			branch: 'develop',
			force: 'with-lease',
			protectedBranches: ['develop'],
			authorization: { by: 'ops', reason: 'emergency history recovery' },
		});
		expect(result.ok).toBe(true);
		expect(calls[0]).toEqual([
			'push',
			'origin',
			'develop',
			'--force-with-lease',
		]);
		expect(listForcePushAuthorizations()).toHaveLength(1);
	});

	it('plain force with no protectedBranches configured only needs authorization', async () => {
		const { runner } = captureRunner([{ ok: true, output: '' }]);
		const result = await gitPush(runner, {
			branch: 'develop',
			force: 'true',
			authorization: { by: 'agent-1', reason: 'ok' },
		});
		expect(result.ok).toBe(true);
	});

	it('non-force push is unaffected by protectedBranches/authorization', async () => {
		const { runner, calls } = captureRunner([{ ok: true, output: '' }]);
		const result = await gitPush(runner, {
			remote: 'origin',
			branch: 'develop',
			protectedBranches: ['develop'],
		});
		expect(result.ok).toBe(true);
		expect(calls[0]).toEqual(['push', 'origin', 'develop']);
	});
});
