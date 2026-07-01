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
import { describe, expect, it } from 'vitest';

import {
	commitAndPush,
	gitCommit,
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
