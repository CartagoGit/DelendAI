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
import { describe, expect, it } from 'vitest';

import type {
	IGitRunResult,
	IGitRunner,
} from '@mcp-vertex/proposals/lib/shared/git-runner';
import {
	maybePersistAfterSlice,
	renderCommitMessage,
} from '@mcp-vertex/proposals/lib/tools/auto-work-persist';

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

describe('maybePersistAfterSlice', async () => {
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
			{ mode: 'commit-and-push', pushTarget: 'origin main', git: runner },
		);
		expect(result.committed).toBe(true);
		expect(result.pushed).toBe(false);
		expect(result.reason).toBe('refusing to push to main automatically');
		expect(runner.calls.some((a) => a[0] === 'push')).toBe(false);
	});

	it("mode 'commit-and-push' pushes when target is not main", async () => {
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
				git: runner,
			},
		);
		expect(result.committed).toBe(true);
		expect(result.pushed).toBe(false);
		expect(result.hash).toBe('abc1234');
		expect(result.reason).toContain('git push failed');
	});

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
