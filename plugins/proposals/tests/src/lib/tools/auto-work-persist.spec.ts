/**
 * `maybePersistAfterSlice` contract guard (l109 s2).
 *
 * Pins the four guarantees the helper makes to `auto_work`:
 *
 * 1. `'none'` mode is a hard no-op — no git invocations, even if the
 *    runner is provided.
 * 2. Files are passed to `git add -- <files>` verbatim (never `git add
 *    .`), so the helper cannot fold unreviewed changes into the slice.
 * 3. The push to `main` safety net refuses explicitly and reports
 *    `{ committed: true, pushed: false, reason: '…' }`.
 * 4. Every failure mode is reported as `{ committed, pushed, reason }`
 *    — the helper NEVER throws.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type {
	IGitRunResult,
	IGitRunner,
} from '@delendai/proposals/lib/shared/git-runner';
import { createGitRunner } from '@delendai/proposals/lib/shared/git-runner';
import {
	maybePersistAfterSlice,
	renderCommitMessage,
} from '@delendai/proposals/lib/tools/auto-work-persist';

/**
 * Build a fake `IGitRunner` that returns `ok: true` with the given
 * `output` for any args that match `match`, and `ok: false` otherwise.
 * Captures the args it saw so tests can assert on them.
 */
const fakeRunner = (
	matches: ReadonlyArray<{
		match: (args: readonly string[]) => boolean;
		output?: string;
		reason?: string;
		ok?: boolean;
	}>,
): IGitRunner & { calls: readonly (readonly string[])[] } => {
	const calls: (readonly string[])[] = [];
	const fn = ((args: readonly string[]): Promise<IGitRunResult> => {
		calls.push(args);
		for (const m of matches) {
			if (m.match(args)) {
				const result: { ok: boolean; output: string; reason?: string } =
					{
						ok: m.ok ?? true,
						output: m.output ?? '',
					};
				if (m.reason !== undefined) result.reason = m.reason;
				return Promise.resolve(result);
			}
		}
		return Promise.resolve({
			ok: false,
			output: '',
			reason: `fakeRunner: no match for ${args.join(' ')}`,
		});
	}) as IGitRunner & { calls: readonly (readonly string[])[] };
	fn.calls = calls;
	return fn;
};

describe('createGitRunner', async () => {
	it('reports a real git command error', async () => {
		const result = await createGitRunner(process.cwd())([
			'not-a-real-subcommand',
		]);

		expect(result.ok).toBe(false);
		expect(result.reason).toMatch(/not-a-real-subcommand|unknown/u);
	});

	it('reports a real git timeout', async () => {
		const cwd = await mkdtemp(join(tmpdir(), 'x00298-git-runner-'));
		try {
			const runner = createGitRunner(cwd);
			const init = await runner(['init']);
			expect(init.ok).toBe(true);

			const result = await createGitRunner(
				cwd,
				10,
			)(['cat-file', '--batch']);

			expect(result.ok).toBe(false);
			expect(result.reason).toContain('timed out');
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
});

describe('maybePersistAfterSlice', async () => {
	it('uses the real async runner by default', async () => {
		const result = await createGitRunner(process.cwd())(['--version']);

		expect(result.ok).toBe(true);
		expect(result.output).toMatch(/git version/u);
	});

	it('uses an injected runner instead of spawning git', async () => {
		const runner = fakeRunner([
			{ match: (a) => a[0] === 'add', output: '' },
			{ match: (a) => a[0] === 'commit', output: '' },
			{ match: (a) => a[0] === 'rev-parse', output: 'inject01' },
		]);

		const result = await maybePersistAfterSlice(
			['plugins/proposals/src/lib/foo.ts'],
			'x00298',
			'S1',
			{ mode: 'commit', git: runner },
		);

		expect(result.hash).toBe('inject01');
		expect(runner.calls.length).toBe(3);
	});

	it("mode 'none' is a hard no-op (no git calls)", async () => {
		const runner = fakeRunner([
			{
				match: () => true,
				output: 'should not be called',
			},
		]);
		const result = await maybePersistAfterSlice(
			['plugins/proposals/src/lib/foo.ts'],
			'l109',
			's2',
			{ mode: 'none', git: runner },
		);
		expect(result).toEqual({
			committed: false,
			pushed: false,
			mode: 'none',
		});
		expect(runner.calls).toHaveLength(0);
	});

	it("mode 'commit' stages the files with `git add -- <files>`", async () => {
		const runner = fakeRunner([
			{ match: (a) => a[0] === 'add', output: '' },
			{ match: (a) => a[0] === 'commit', output: '' },
			{ match: (a) => a[0] === 'rev-parse', output: 'abc1234' },
		]);
		const result = await maybePersistAfterSlice(
			['plugins/proposals/src/lib/foo.ts'],
			'l109',
			's2',
			{ mode: 'commit', git: runner },
		);
		expect(result.committed).toBe(true);
		expect(result.pushed).toBe(false);
		expect(result.hash).toBe('abc1234');
		expect(runner.calls[0]?.slice(0, 2)).toEqual(['add', '--']);
		expect(runner.calls[0]?.slice(2)).toEqual([
			'plugins/proposals/src/lib/foo.ts',
		]);
	});

	it('includes all dirty files only when foreign changes are allowed', async () => {
		const runner = fakeRunner([
			{
				match: (a) => a[0] === 'status',
				output: ' M plugins/proposals/src/lib/foo.ts\n?? unrelated.txt\n',
			},
			{ match: (a) => a[0] === 'add', output: '' },
			{ match: (a) => a[0] === 'commit', output: '' },
			{ match: (a) => a[0] === 'rev-parse', output: 'abc1234' },
		]);

		const result = await maybePersistAfterSlice(
			['plugins/proposals/src/lib/foo.ts'],
			'x00298',
			'S1',
			{ mode: 'commit', allowForeignChanges: true, git: runner },
		);

		expect(result.committed).toBe(true);
		expect(runner.calls.find((a) => a[0] === 'add')?.slice(2)).toEqual([
			'plugins/proposals/src/lib/foo.ts',
			'unrelated.txt',
		]);
	});

	it('renders the default template `<area>(<proposalId>): <sliceId>`', async () => {
		const runner = fakeRunner([
			{ match: (a) => a[0] === 'add', output: '' },
			{
				match: (a) => a[0] === 'commit' && a[1] === '-m',
				output: '',
			},
			{ match: (a) => a[0] === 'rev-parse', output: 'abc1234' },
		]);
		await maybePersistAfterSlice(
			['plugins/proposals/src/lib/foo.ts'],
			'l109',
			's2',
			{ mode: 'commit', git: runner },
		);
		const commitArgs = runner.calls.find(
			(a) => a[0] === 'commit' && a[1] === '-m',
		);
		expect(commitArgs?.[2]).toBe('plugins(l109): s2');
	});

	it('refuses to push to `main` (safety net)', async () => {
		const runner = fakeRunner([
			{ match: (a) => a[0] === 'add', output: '' },
			{ match: (a) => a[0] === 'commit', output: '' },
			{ match: (a) => a[0] === 'rev-parse', output: 'abc1234' },
			{
				// Push MUST NOT be attempted: the runner would otherwise
				// receive a `push` call. Assert the absence.
				match: (a) => a[0] === 'push',
				output: '',
				ok: true,
			},
		]);
		const result = await maybePersistAfterSlice(
			['plugins/proposals/src/lib/foo.ts'],
			'l109',
			's2',
			{
				mode: 'commit-and-push',
				pushTarget: 'origin main',
				agentWorktreeEnabled: true,
				git: runner,
			},
		);
		expect(result.committed).toBe(true);
		expect(result.pushed).toBe(false);
		expect(result.reason).toBe('refusing to push to main automatically');
		expect(runner.calls.some((a) => a[0] === 'push')).toBe(false);
	});

	it('pushes to `develop` when it is not in the protected-branch policy', async () => {
		const runner = fakeRunner([
			{ match: (a) => a[0] === 'add', output: '' },
			{ match: (a) => a[0] === 'commit', output: '' },
			{ match: (a) => a[0] === 'rev-parse', output: 'abc1234' },
			{ match: (a) => a[0] === 'push', output: '' },
		]);
		const result = await maybePersistAfterSlice(
			['plugins/proposals/src/lib/foo.ts'],
			'l109',
			's2',
			{
				mode: 'commit-and-push',
				pushTarget: 'origin develop',
				agentWorktreeEnabled: true,
				protectedBranches: ['main', 'master'],
				git: runner,
			},
		);
		expect(result.committed).toBe(true);
		expect(result.pushed).toBe(true);
		expect(runner.calls.some((a) => a[0] === 'push')).toBe(true);
	});

	it('allows commit-and-push in shared checkout when the target is not protected', async () => {
		const runner = fakeRunner([
			{ match: (a) => a[0] === 'add', output: '' },
			{ match: (a) => a[0] === 'commit', output: '' },
			{ match: (a) => a[0] === 'rev-parse', output: 'abc1234' },
			{ match: (a) => a[0] === 'push', output: '' },
		]);
		const result = await maybePersistAfterSlice(
			['plugins/proposals/src/lib/foo.ts'],
			'x00298',
			'S1',
			{
				mode: 'commit-and-push',
				pushTarget: 'origin develop',
				agentWorktreeEnabled: false,
				protectedBranches: ['main', 'master'],
				git: runner,
			},
		);

		expect(result.committed).toBe(true);
		expect(result.pushed).toBe(true);
	});

	it('allows an explicit branch refspec when agentWorktree is enabled', async () => {
		const runner = fakeRunner([
			{ match: (a) => a[0] === 'add', output: '' },
			{ match: (a) => a[0] === 'commit', output: '' },
			{ match: (a) => a[0] === 'rev-parse', output: 'worktree01' },
			{ match: (a) => a[0] === 'push', output: '' },
		]);
		const result = await maybePersistAfterSlice(
			['plugins/proposals/src/lib/foo.ts'],
			'x00298',
			'S1',
			{
				mode: 'commit-and-push',
				pushTarget: 'origin HEAD:agent/x00298-S1',
				agentWorktreeEnabled: true,
				git: runner,
			},
		);

		expect(result).toMatchObject({
			committed: true,
			pushed: true,
			hash: 'worktree01',
		});
		expect(runner.calls.find((a) => a[0] === 'push')).toEqual([
			'push',
			'origin',
			'HEAD:agent/x00298-S1',
		]);
	});

	it("mode 'commit-and-push' pushes when target is a wip/* branch (not main or develop)", async () => {
		const runner = fakeRunner([
			{ match: (a) => a[0] === 'add', output: '' },
			{ match: (a) => a[0] === 'commit', output: '' },
			{ match: (a) => a[0] === 'rev-parse', output: 'deadbeef' },
			{ match: (a) => a[0] === 'push', output: '' },
		]);
		const result = await maybePersistAfterSlice(
			['plugins/proposals/src/lib/foo.ts'],
			'l109',
			's2',
			{
				mode: 'commit-and-push',
				pushTarget: 'origin agent/l109',
				agentWorktreeEnabled: true,
				git: runner,
			},
		);
		expect(result.committed).toBe(true);
		expect(result.pushed).toBe(true);
		expect(result.hash).toBe('deadbeef');
		const pushCall = runner.calls.find((a) => a[0] === 'push');
		expect(pushCall).toEqual(['push', 'origin', 'agent/l109']);
	});

	it('reports a friendly reason when `git add` fails (never throws)', async () => {
		const runner = fakeRunner([
			{
				match: (a) => a[0] === 'add',
				ok: false,
				reason: 'fatal: pathspec did not match',
			},
		]);
		const result = await maybePersistAfterSlice(
			['plugins/proposals/src/lib/foo.ts'],
			'l109',
			's2',
			{ mode: 'commit', git: runner },
		);
		expect(result.committed).toBe(false);
		expect(result.pushed).toBe(false);
		expect(result.reason).toContain('git add failed');
	});

	it("treats 'nothing to commit' as a non-error (already clean)", async () => {
		const runner = fakeRunner([
			{ match: (a) => a[0] === 'add', output: '' },
			{
				match: (a) => a[0] === 'commit',
				ok: false,
				reason: 'nothing to commit, working tree clean',
			},
		]);
		const result = await maybePersistAfterSlice(
			['plugins/proposals/src/lib/foo.ts'],
			'l109',
			's2',
			{ mode: 'commit', git: runner },
		);
		expect(result.committed).toBe(false);
		expect(result.reason).toContain('already clean');
	});

	it('reports `git push` failure without losing the commit', async () => {
		const runner = fakeRunner([
			{ match: (a) => a[0] === 'add', output: '' },
			{ match: (a) => a[0] === 'commit', output: '' },
			{ match: (a) => a[0] === 'rev-parse', output: 'abc1234' },
			{
				match: (a) => a[0] === 'push',
				ok: false,
				reason: 'remote rejected: non-fast-forward',
			},
		]);
		const result = await maybePersistAfterSlice(
			['plugins/proposals/src/lib/foo.ts'],
			'l109',
			's2',
			{
				mode: 'commit-and-push',
				pushTarget: 'origin agent/l109',
				agentWorktreeEnabled: true,
				git: runner,
			},
		);
		expect(result.committed).toBe(true);
		expect(result.pushed).toBe(false);
		expect(result.hash).toBe('abc1234');
		expect(result.reason).toContain('git push failed');
	});

	it.each([
		['rejected', 'remote rejected: non-fast-forward'],
		['error', 'remote unavailable'],
		['timeout', 'git timed out after 15000ms'],
	])(
		'surfaces a push %s as incomplete, not success',
		async (_kind, reason) => {
			const runner = fakeRunner([
				{ match: (a) => a[0] === 'add', output: '' },
				{ match: (a) => a[0] === 'commit', output: '' },
				{ match: (a) => a[0] === 'rev-parse', output: 'pushfail' },
				{ match: (a) => a[0] === 'push', ok: false, reason },
			]);

			const result = await maybePersistAfterSlice(
				['plugins/proposals/src/lib/foo.ts'],
				'x00298',
				'S1',
				{
					mode: 'commit-and-push',
					pushTarget: 'origin agent/x00298',
					agentWorktreeEnabled: true,
					git: runner,
				},
			);

			expect(result).toMatchObject({
				committed: true,
				pushed: false,
				hash: 'pushfail',
			});
			expect(result.reason).toContain(reason);
		},
	);

	it('returns early when the file list is empty (no `git add` issued)', async () => {
		const runner = fakeRunner([
			{
				match: () => true,
				output: 'should not be called',
			},
		]);
		const result = await maybePersistAfterSlice([], 'l109', 's2', {
			mode: 'commit',
			git: runner,
		});
		expect(result.committed).toBe(false);
		expect(result.reason).toBe('no files to commit (empty slice)');
		expect(runner.calls).toHaveLength(0);
	});

	describe('commitAuthor policy (f00082)', () => {
		it('threads --author=<flag> into the git commit call', async () => {
			const runner = fakeRunner([
				{ match: (a) => a[0] === 'add', output: '' },
				{ match: (a) => a[0] === 'commit', output: '' },
				{ match: (a) => a[0] === 'rev-parse', output: 'deadbee' },
			]);
			const result = await maybePersistAfterSlice(
				['plugins/proposals/src/lib/foo.ts'],
				'l109',
				's2',
				{
					mode: 'commit',
					git: runner,
					commitAuthor: {
						authorFlag: '"Cartago (M3)" <cartago@local>',
						label: 'named (Cartago (M3) <cartago@local>)',
					},
				},
			);
			expect(result.committed).toBe(true);
			expect(result.hash).toBe('deadbee');
			const commitCall = runner.calls.find(
				(calls) => calls[0] === 'commit',
			);
			expect(commitCall).toBeDefined();
			expect(commitCall).toContain(
				'--author="Cartago (M3)" <cartago@local>',
			);
		});

		it('refuses the persist step when the policy carries a reason', async () => {
			const runner = fakeRunner([
				{
					match: () => true,
					output: 'should not be called',
				},
			]);
			const result = await maybePersistAfterSlice(
				['plugins/proposals/src/lib/foo.ts'],
				'l109',
				's2',
				{
					mode: 'commit',
					git: runner,
					commitAuthor: {
						authorFlag: '',
						label: 'git',
						reason: 'mode "git" requires `git config user.name` and `user.email`',
					},
				},
			);
			expect(result.committed).toBe(false);
			expect(result.reason).toContain('mode "git" requires');
			// No git invocations: the refusal happens BEFORE `git add`.
			expect(runner.calls).toHaveLength(0);
		});

		it('omits --author when commitAuthor is absent (default preserved)', async () => {
			const runner = fakeRunner([
				{ match: (a) => a[0] === 'add', output: '' },
				{ match: (a) => a[0] === 'commit', output: '' },
				{ match: (a) => a[0] === 'rev-parse', output: 'cafef00' },
			]);
			await maybePersistAfterSlice(
				['plugins/proposals/src/lib/foo.ts'],
				'l109',
				's2',
				{ mode: 'commit', git: runner },
			);
			const commitCall = runner.calls.find(
				(calls) => calls[0] === 'commit',
			);
			expect(commitCall).toBeDefined();
			expect(commitCall?.some((arg) => arg.startsWith('--author='))).toBe(
				false,
			);
		});
	});
});

describe('renderCommitMessage', async () => {
	it('substitutes the three known placeholders', async () => {
		expect(
			renderCommitMessage(
				'<area>(<proposalId>): <sliceId>',
				'plugins',
				'l109',
				's2',
			),
		).toBe('plugins(l109): s2');
	});

	it('passes unknown placeholders through verbatim', async () => {
		expect(
			renderCommitMessage(
				'feat(<unknown>): <sliceId>',
				'plugins',
				'l109',
				's2',
			),
		).toBe('feat(<unknown>): s2');
	});
});

describe('f00156 S7 stale-acceptance persist guard', async () => {
	it('f00156 S7: commit with stale acceptance still commits (warn-only)', async () => {
		const runner = fakeRunner([
			{ match: (a) => a[0] === 'add', output: '' },
			{ match: (a) => a[0] === 'commit', output: '' },
			{ match: (a) => a[0] === 'rev-parse', output: 'abc1234' },
		]);
		const result = await maybePersistAfterSlice(
			['plugins/proposals/src/lib/foo.ts'],
			'f00156',
			'S7',
			{
				mode: 'commit',
				git: runner,
				acceptanceEvidence: {
					sliceId: 'S7',
					gitTreeHash: 'tree1',
					lastMeaningfulChangeAt: '2026-08-23T12:00:00.000Z',
					requiresValidation: true,
				},
			},
		);
		expect(result.committed).toBe(true);
		expect(result.pushed).toBe(false);
	});

	it('f00156 S7: push is refused when required acceptance is stale', async () => {
		const runner = fakeRunner([{ match: () => true, output: '' }]);
		const result = await maybePersistAfterSlice(
			['plugins/proposals/src/lib/foo.ts'],
			'f00156',
			'S7',
			{
				mode: 'commit-and-push',
				pushTarget: 'origin agent/f00156',
				agentWorktreeEnabled: true,
				git: runner,
				acceptanceEvidence: {
					sliceId: 'S7',
					gitTreeHash: 'tree1',
					lastMeaningfulChangeAt: '2026-08-23T12:00:00.000Z',
					validatedAt: '2026-08-23T11:00:00.000Z',
					validationPassed: true,
					requiresValidation: true,
				},
			},
		);
		expect(result.committed).toBe(false);
		expect(result.pushed).toBe(false);
		expect(result.reason).toMatch(/changed after/u);
		expect(runner.calls).toHaveLength(0);
	});

	it('f00156 S7: push is allowed when validation is not required', async () => {
		const runner = fakeRunner([
			{ match: (a) => a[0] === 'add', output: '' },
			{ match: (a) => a[0] === 'commit', output: '' },
			{ match: (a) => a[0] === 'rev-parse', output: 'deadbeef' },
			{ match: (a) => a[0] === 'push', output: '' },
		]);
		const result = await maybePersistAfterSlice(
			['plugins/proposals/src/lib/foo.ts'],
			'f00156',
			'S7',
			{
				mode: 'commit-and-push',
				pushTarget: 'origin agent/f00156',
				agentWorktreeEnabled: true,
				git: runner,
				acceptanceEvidence: {
					sliceId: 'S7',
					gitTreeHash: 'tree1',
					lastMeaningfulChangeAt: '2026-08-23T12:00:00.000Z',
					requiresValidation: false,
				},
			},
		);
		expect(result.pushed).toBe(true);
	});
});
