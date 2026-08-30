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
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	clearForcePushAuthorizationsForTests,
	commitAndPush,
	createGitRunner,
	gitCommit,
	gitHeadShortHash,
	gitLastCommitAuthor,
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
			protectedBranches: [],
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

	it('allows force-with-lease to proceed when the caller explicitly opts out of protected branches', async () => {
		const { runner, calls } = captureRunner([{ ok: true, output: '' }]);
		const result = await gitPush(runner, {
			remote: 'origin',
			branch: 'main',
			force: 'with-lease',
			protectedBranches: [],
			authorization: {
				by: 'ops',
				reason: 'explicit protected-branch opt-out for this push',
			},
		});
		expect(result.ok).toBe(true);
		expect(calls[0]).toEqual([
			'push',
			'origin',
			'main',
			'--force-with-lease',
		]);
		expect(listForcePushAuthorizations()).toEqual([
			expect.objectContaining({
				by: 'ops',
				reason: 'explicit protected-branch opt-out for this push',
				branch: 'main',
				forceMode: 'with-lease',
			}),
		]);
	});

	it('refuses plain force without authorization', async () => {
		const { runner, calls } = captureRunner([]);
		const result = await gitPush(runner, {
			remote: 'origin',
			branch: 'agent/x',
			force: 'true',
			protectedBranches: [],
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
			protectedBranches: [],
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
			protectedBranches: [],
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

	it('deterministically refuses a force push only when the caller explicitly lists the protected branch', async () => {
		const { runner, calls } = captureRunner([]);
		const result = await gitPush(runner, {
			remote: 'origin',
			branch: 'main',
			force: 'with-lease',
			protectedBranches: ['main'],
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toBe(
			'force push refused: "main" is a protected branch — pass options.authorization { by, reason } to override',
		);
		expect(calls).toHaveLength(0);
		expect(listForcePushAuthorizations()).toHaveLength(0);
	});

	it('rejects force pushes without protectedBranches at compile time', () => {
		const { runner } = captureRunner([]);
		const compileTimeCheck = (): void => {
			// @ts-expect-error protectedBranches must be provided explicitly when force is used
			void gitPush(runner, { force: 'with-lease' });
		};
		void compileTimeCheck;
		expect(true).toBe(true);
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
			protectedBranches: [],
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

	it('resolves the protected-branch check against a src:dst refspec by its destination', async () => {
		const { runner, calls } = captureRunner([]);
		const result = await gitPush(runner, {
			remote: 'origin',
			branch: 'agent/x:refs/heads/develop',
			force: 'with-lease',
			protectedBranches: ['develop'],
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toMatch(/"develop" is a protected branch/u);
		expect(calls).toHaveLength(0);
	});

	it('resolves the protected-branch check against a refs/heads/-prefixed branch by its bare name', async () => {
		const { runner, calls } = captureRunner([]);
		const result = await gitPush(runner, {
			remote: 'origin',
			branch: 'refs/heads/main',
			force: 'with-lease',
			protectedBranches: ['main'],
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toMatch(/"main" is a protected branch/u);
		expect(calls).toHaveLength(0);
	});

	it('proceeds with a protected-branch force push when the current branch cannot be resolved', async () => {
		// resolveForceTargetBranch falls back to `undefined` when `rev-parse`
		// fails, which bypasses the protectedBranches.includes() guard —
		// this locks down that the code favours letting the push through
		// over blocking it when it cannot determine what branch is targeted.
		const { runner, calls } = captureRunner([
			{ ok: false, output: '', reason: 'not a git repository' }, // rev-parse --abbrev-ref HEAD
			{ ok: true, output: '' }, // push
		]);
		const result = await gitPush(runner, {
			force: 'with-lease',
			protectedBranches: ['develop'],
		});
		expect(result.ok).toBe(true);
		expect(calls[0]).toEqual(['rev-parse', '--abbrev-ref', 'HEAD']);
		expect(calls[1]).toEqual(['push', '--force-with-lease']);
	});
});

describe('gitHeadShortHash', () => {
	it('returns undefined when rev-parse fails', async () => {
		const { runner } = captureRunner([
			{ ok: false, output: '', reason: 'not a git repository' },
		]);
		const result = await gitHeadShortHash(runner);
		expect(result).toBeUndefined();
	});
});

describe('gitLastCommitAuthor', () => {
	it('returns the trimmed author name on success', async () => {
		const { runner } = captureRunner([{ ok: true, output: '  Ana  \n' }]);
		const result = await gitLastCommitAuthor(runner);
		expect(result).toBe('Ana');
	});

	it('returns undefined when the log lookup itself failed, even if stray output leaked through', async () => {
		const { runner } = captureRunner([
			{ ok: false, output: 'Ana', reason: 'no commits yet' },
		]);
		const result = await gitLastCommitAuthor(runner);
		expect(result).toBeUndefined();
	});

	it('returns undefined when git succeeds but the author field is blank', async () => {
		const { runner } = captureRunner([{ ok: true, output: '   ' }]);
		const result = await gitLastCommitAuthor(runner);
		expect(result).toBeUndefined();
	});
});

describe('createGitRunner — error classification against the real execFile path', () => {
	// These exercise the actual execFile-backed runner (not the fake
	// captureRunner used above) against a throwaway `git` binary on PATH,
	// so the ENOENT/timeout/stderr classification in the callback is
	// proven against real child-process error shapes instead of assumed.
	let originalPath: string | undefined;
	let fakeBinDir: string;
	let workDir: string;

	beforeEach(() => {
		originalPath = process.env.PATH;
		fakeBinDir = mkdtempSync(join(tmpdir(), 'git-write-fakebin-'));
		workDir = mkdtempSync(join(tmpdir(), 'git-write-workdir-'));
	});

	afterEach(() => {
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
		rmSync(fakeBinDir, { recursive: true, force: true });
		rmSync(workDir, { recursive: true, force: true });
	});

	const installFakeGit = (script: string): void => {
		const gitPath = join(fakeBinDir, 'git');
		writeFileSync(gitPath, script);
		chmodSync(gitPath, 0o755);
	};

	it('reports a typed reason when git is not resolvable on PATH', async () => {
		// fakeBinDir intentionally has no `git` executable in it.
		process.env.PATH = fakeBinDir;
		const run = createGitRunner(workDir);
		const result = await run(['status']);
		expect(result).toEqual({
			ok: false,
			output: '',
			reason: 'git is not installed or not on PATH',
		});
	});

	it('reports a timeout reason when git exceeds timeoutMs and is killed', async () => {
		installFakeGit('#!/bin/sh\nsleep 5\n');
		process.env.PATH = `${fakeBinDir}:${originalPath ?? ''}`;
		const run = createGitRunner(workDir, 100);
		const result = await run(['status']);
		expect(result).toEqual({
			ok: false,
			output: '',
			reason: 'git timed out after 100ms',
		});
	}, 10_000);

	it('falls back to the first ANSI-free line of stderr when git fails for another reason', async () => {
		installFakeGit(
			'#!/bin/sh\nprintf "\\033[38;2;5;5;5m fatal: not a git repository\\033[0m\\n" >&2\nexit 128\n',
		);
		process.env.PATH = `${fakeBinDir}:${originalPath ?? ''}`;
		const run = createGitRunner(workDir);
		const result = await run(['status']);
		expect(result).toEqual({
			ok: false,
			output: '',
			reason: 'fatal: not a git repository',
		});
	});

	it('falls back to the child-process error message when git fails with no stderr', async () => {
		installFakeGit('#!/bin/sh\nexit 1\n');
		process.env.PATH = `${fakeBinDir}:${originalPath ?? ''}`;
		const run = createGitRunner(workDir);
		const result = await run(['status']);
		expect(result.ok).toBe(false);
		expect(result.reason).toBeTruthy();
	});

	it('resolves with stdout on success', async () => {
		installFakeGit('#!/bin/sh\necho "hello"\n');
		process.env.PATH = `${fakeBinDir}:${originalPath ?? ''}`;
		const run = createGitRunner(workDir);
		const result = await run(['status']);
		expect(result).toEqual({ ok: true, output: 'hello\n' });
	});
});

describe('commitAndPush — refusal, failure and fallback paths', () => {
	it('refuses with no files when skipAdd is not set and files is an empty array', async () => {
		const { runner, calls } = captureRunner([]);
		const result = await commitAndPush({
			files: [],
			message: 'feat: x',
			git: runner,
		});
		expect(result).toEqual({
			committed: false,
			pushed: false,
			reason: 'no files to commit (empty file list)',
		});
		expect(calls).toHaveLength(0); // git is never invoked
	});

	it('refuses with no files when skipAdd is not set and files is omitted entirely', async () => {
		const { runner, calls } = captureRunner([]);
		const result = await commitAndPush({ message: 'feat: x', git: runner });
		expect(result.committed).toBe(false);
		expect(result.reason).toBe('no files to commit (empty file list)');
		expect(calls).toHaveLength(0);
	});

	it('surfaces a typed reason when git add fails, without attempting a commit', async () => {
		const { runner, calls } = captureRunner([
			{ ok: false, output: '', reason: 'fatal: pathspec did not match' },
		]);
		const result = await commitAndPush({
			files: ['missing.ts'],
			message: 'feat: x',
			git: runner,
		});
		expect(result).toEqual({
			committed: false,
			pushed: false,
			reason: 'git add failed: fatal: pathspec did not match',
		});
		expect(calls).toHaveLength(1); // only `git add` ran
	});

	it('detects an already-clean worktree from commit stderr and reports it distinctly from other failures', async () => {
		const { runner } = captureRunner([
			{ ok: true, output: '' }, // add
			{
				ok: false,
				output: '',
				reason: 'nothing to commit, working tree clean',
			},
		]);
		const result = await commitAndPush({
			files: ['x.ts'],
			message: 'feat: x',
			git: runner,
		});
		expect(result).toEqual({
			committed: false,
			pushed: false,
			reason: 'nothing to commit (worktree already clean)',
		});
	});

	it('reports a generic commit failure reason when it is not the already-clean case', async () => {
		const { runner } = captureRunner([
			{ ok: true, output: '' },
			{ ok: false, output: '', reason: 'error: pathspec conflict' },
		]);
		const result = await commitAndPush({
			files: ['x.ts'],
			message: 'feat: x',
			git: runner,
		});
		expect(result).toEqual({
			committed: false,
			pushed: false,
			reason: 'git commit failed: error: pathspec conflict',
		});
	});

	it('threads amend through to the underlying gitCommit call', async () => {
		const { runner, calls } = captureRunner([
			{ ok: true, output: '' }, // add
			{ ok: true, output: '' }, // commit
			{ ok: true, output: 'abc1234' }, // rev-parse
		]);
		const result = await commitAndPush({
			files: ['x.ts'],
			message: 'feat: x',
			amend: true,
			git: runner,
		});
		expect(result.committed).toBe(true);
		expect(calls[1]).toEqual(['commit', '--amend', '-m', 'feat: x']);
	});

	it('commits successfully with skipAdd and reports no hash when it could not be resolved', async () => {
		const { runner, calls } = captureRunner([
			{ ok: true, output: '' }, // commit
			{ ok: false, output: '', reason: 'not a git repository' }, // rev-parse
		]);
		const result = await commitAndPush({
			skipAdd: true,
			message: 'feat: x',
			git: runner,
		});
		expect(result).toEqual({ committed: true, pushed: false });
		expect(calls).toHaveLength(2); // add was skipped entirely
	});

	it('reports a push failure while still surfacing the resolved commit hash', async () => {
		const { runner } = captureRunner([
			{ ok: true, output: '' }, // add
			{ ok: true, output: '' }, // commit
			{ ok: true, output: 'abc1234\n' }, // rev-parse
			{ ok: false, output: '', reason: 'remote rejected' }, // push
		]);
		const result = await commitAndPush({
			files: ['x.ts'],
			message: 'feat: x',
			git: runner,
			push: { protectedBranches: [] },
		});
		expect(result).toEqual({
			committed: true,
			pushed: false,
			hash: 'abc1234',
			reason: 'git push failed: remote rejected',
		});
	});

	it('reports a push failure with no hash key when the hash lookup itself failed', async () => {
		const { runner } = captureRunner([
			{ ok: true, output: '' }, // add
			{ ok: true, output: '' }, // commit
			{ ok: false, output: '', reason: 'detached HEAD' }, // rev-parse
			{ ok: false, output: '', reason: 'remote unreachable' }, // push
		]);
		const result = await commitAndPush({
			files: ['x.ts'],
			message: 'feat: x',
			git: runner,
			push: { protectedBranches: [] },
		});
		expect(result).toEqual({
			committed: true,
			pushed: false,
			reason: 'git push failed: remote unreachable',
		});
		expect(result).not.toHaveProperty('hash');
	});

	it('reports a successful push even when the hash could not be resolved', async () => {
		const { runner } = captureRunner([
			{ ok: true, output: '' }, // add
			{ ok: true, output: '' }, // commit
			{ ok: false, output: '', reason: 'detached HEAD' }, // rev-parse
			{ ok: true, output: '' }, // push
		]);
		const result = await commitAndPush({
			files: ['x.ts'],
			message: 'feat: x',
			git: runner,
			push: { protectedBranches: [] },
		});
		expect(result).toEqual({ committed: true, pushed: true });
		expect(result).not.toHaveProperty('hash');
	});

	it('commits and pushes successfully end-to-end, carrying the resolved hash', async () => {
		const { runner, calls } = captureRunner([
			{ ok: true, output: '' }, // add
			{ ok: true, output: '' }, // commit
			{ ok: true, output: 'def5678\n' }, // rev-parse
			{ ok: true, output: '' }, // push
		]);
		const result = await commitAndPush({
			files: ['x.ts'],
			message: 'feat: x',
			git: runner,
			push: { protectedBranches: [] },
		});
		expect(result).toEqual({
			committed: true,
			pushed: true,
			hash: 'def5678',
		});
		expect(calls).toHaveLength(4);
	});
});
