import { describe, expect, it } from 'vitest';

import {
	gitAdd,
	type IGitRunner,
	type IGitRunResult,
} from '@mcp-vertex/core/public';

import { createThresholdTracker } from '@mcp-vertex/commit-policy/lib/triggers/threshold-tracker';
import { gitCachedNames } from '@mcp-vertex/commit-policy/lib/services/git-extra';

const ok = (output: string): IGitRunResult => ({ ok: true, output });

const fail = (reason: string): IGitRunResult => ({
	ok: false,
	output: '',
	reason,
});

const buildRunner = (
	handler: (args: readonly string[]) => Promise<IGitRunResult>,
): IGitRunner => handler as IGitRunner;

/**
 * x00264 (AUD-CP-006) end-to-end: a stateful mini-git so the test
 * can replay the driver's staging contract at the git boundary —
 * `git status --porcelain=v1` → tracker fires with `files` →
 * `git add -- <files>` (real `gitAdd`) mutates the index → the
 * post-stage `git diff --cached --name-only` (real `gitCachedNames`)
 * must be a subset of `event.files`. No real git binary, no driver.
 *
 * State: each path carries porcelain XY letters — `x` (index) and
 * `y` (worktree). `git add` promotes the worktree letter into the
 * index and clears the worktree side, exactly like real git.
 */
interface IMiniGitFile {
	readonly x: string;
	readonly y: string;
}

const buildMiniGit = (
	initial: ReadonlyArray<readonly [string, IMiniGitFile]>,
): { readonly runner: IGitRunner } => {
	const state = new Map<string, IMiniGitFile>(
		initial.map(([path, file]) => [path, { x: file.x, y: file.y }]),
	);
	const runner: IGitRunner = async (args) => {
		const [cmd, flag, flag2] = args;
		if (cmd === 'status' && flag === '--porcelain=v1') {
			const lines = [...state.entries()]
				.map(([path, file]) => `${file.x}${file.y} ${path}`)
				.sort();
			return ok(lines.length > 0 ? `${lines.join('\n')}\n` : '');
		}
		if (cmd === 'diff' && flag === '--cached' && flag2 === '--name-only') {
			const names = [...state.entries()]
				.filter(([, file]) => file.x !== ' ')
				.map(([path]) => path)
				.sort();
			return ok(names.length > 0 ? `${names.join('\n')}\n` : '');
		}
		if (cmd === 'add' && flag === '--') {
			// `git add -- <paths>` — the first path sits at args[2].
			for (const path of args.slice(2)) {
				const file = state.get(path);
				if (file === undefined) {
					return fail(`pathspec '${path}' did not match any files`);
				}
				// `git add` stages the worktree state; the worktree side
				// becomes clean afterwards (untracked `?` → staged `A`).
				state.set(path, { x: file.y === '?' ? 'A' : file.y, y: ' ' });
			}
			return ok('');
		}
		return fail(`not stubbed: ${args.join(' ')}`);
	};
	return { runner };
};

describe('threshold tracker', () => {
	it('does not fire when only two dirty files remain under threshold 3', async () => {
		const run = buildRunner((args) => {
			if (args[0] !== 'status')
				return Promise.resolve(fail('not stubbed'));
			return Promise.resolve(ok(' M a.ts\n?? b.ts\nA  staged-only.ts\n'));
		});
		const tracker = createThresholdTracker(run, { files: 3 });
		expect(await tracker.check()).toBeNull();
	});

	it('fires with exactly the three dirty files that reach threshold 3', async () => {
		const run = buildRunner((args) => {
			if (args[0] !== 'status')
				return Promise.resolve(fail('not stubbed'));
			return Promise.resolve(
				ok(' M alpha.ts\nMM beta.ts\n?? gamma.ts\nA  staged-only.ts\n'),
			);
		});
		const tracker = createThresholdTracker(run, { files: 3 });
		const fired = await tracker.check();
		expect(fired).toEqual({
			kind: 'threshold',
			dirtyCount: 3,
			files: { paths: ['alpha.ts', 'beta.ts', 'gamma.ts'] },
		});
	});

	it('refires with all four dirty files when the dirty set grows', async () => {
		const responses: readonly [IGitRunResult, IGitRunResult] = [
			ok(' M alpha.ts\n M beta.ts\n?? gamma.ts\n'),
			ok(' M alpha.ts\n M beta.ts\n?? gamma.ts\nMM delta.ts\n'),
		];
		let index = 0;
		const run = buildRunner((args) => {
			if (args[0] !== 'status')
				return Promise.resolve(fail('not stubbed'));
			const next = index === 0 ? responses[0] : responses[1];
			index += 1;
			return Promise.resolve(next);
		});
		const tracker = createThresholdTracker(run, { files: 3 });
		expect(await tracker.check()).toEqual({
			kind: 'threshold',
			dirtyCount: 3,
			files: { paths: ['alpha.ts', 'beta.ts', 'gamma.ts'] },
		});
		expect(await tracker.check()).toEqual({
			kind: 'threshold',
			dirtyCount: 4,
			files: { paths: ['alpha.ts', 'beta.ts', 'gamma.ts', 'delta.ts'] },
		});
	});

	it('fires again when the dirty set changes but the count stays at three', async () => {
		const responses: readonly [IGitRunResult, IGitRunResult] = [
			ok(' M alpha.ts\n M beta.ts\n?? gamma.ts\n'),
			ok(' M alpha.ts\n M beta.ts\n?? delta.ts\n'),
		];
		let index = 0;
		const run = buildRunner((args) => {
			if (args[0] !== 'status')
				return Promise.resolve(fail('not stubbed'));
			const next = index === 0 ? responses[0] : responses[1];
			index += 1;
			return Promise.resolve(next);
		});
		const tracker = createThresholdTracker(run, { files: 3 });
		expect(await tracker.check()).toEqual({
			kind: 'threshold',
			dirtyCount: 3,
			files: { paths: ['alpha.ts', 'beta.ts', 'gamma.ts'] },
		});
		expect(await tracker.check()).toEqual({
			kind: 'threshold',
			dirtyCount: 3,
			files: { paths: ['alpha.ts', 'beta.ts', 'delta.ts'] },
		});
	});

	it('stays idempotent when the same dirty set repeats at the same count', async () => {
		const run = buildRunner((args) => {
			if (args[0] !== 'status')
				return Promise.resolve(fail('not stubbed'));
			return Promise.resolve(
				ok(' M alpha.ts\n M beta.ts\n?? gamma.ts\n'),
			);
		});
		const tracker = createThresholdTracker(run, { files: 3 });
		expect(await tracker.check()).toEqual({
			kind: 'threshold',
			dirtyCount: 3,
			files: { paths: ['alpha.ts', 'beta.ts', 'gamma.ts'] },
		});
		expect(await tracker.check()).toBeNull();
	});

	it('excludes unrelated staged-only files from event.files', async () => {
		const run = buildRunner((args) => {
			if (args[0] !== 'status')
				return Promise.resolve(fail('not stubbed'));
			return Promise.resolve(
				ok(
					'A  staged-a.ts\n M alpha.ts\n?? beta.ts\n D gamma.ts\nM  staged-b.ts\n',
				),
			);
		});
		const tracker = createThresholdTracker(run, { files: 3 });
		const fired = await tracker.check();
		expect(fired?.files?.paths).toEqual([
			'alpha.ts',
			'beta.ts',
			'gamma.ts',
		]);
		expect(fired?.dirtyCount).toBe(3);
	});

	it('extracts the destination from a rename with a mixed status', async () => {
		const run = buildRunner((args) => {
			if (args[0] !== 'status')
				return Promise.resolve(fail('not stubbed'));
			return Promise.resolve(
				ok('RM docs/old.md -> docs/new.md\n M src/index.ts\n'),
			);
		});
		const tracker = createThresholdTracker(run, { files: 2 });
		const fired = await tracker.check();

		expect(fired).toEqual({
			kind: 'threshold',
			dirtyCount: 2,
			files: { paths: ['docs/new.md', 'src/index.ts'] },
		});
	});
});

describe('threshold tracker — end-to-end staging contract at the git boundary', () => {
	it.skip('historical repro: buggy staging from the cached index would violate predicate != action', async () => {
		const { runner } = buildMiniGit([
			['staged-only.ts', { x: 'A', y: ' ' }],
			['alpha.ts', { x: ' ', y: 'M' }],
			['beta.ts', { x: ' ', y: 'M' }],
			['gamma.ts', { x: '?', y: '?' }],
		]);
		const tracker = createThresholdTracker(runner, { files: 3 });
		const fired = await tracker.check();
		expect(fired?.files?.paths).toEqual([
			'alpha.ts',
			'beta.ts',
			'gamma.ts',
		]);
		if (fired === null) return;

		// Historical bug shape: staging what was already cached would drag
		// foreign staged files into the action instead of using event.files.
		const buggyActionPaths = await gitCachedNames(runner);
		expect(buggyActionPaths).toEqual(['staged-only.ts']);
		expect(buggyActionPaths).not.toEqual(fired.files.paths);
	});

	it('stages exactly the fired dirty set and the post-stage subset check passes', async () => {
		const { runner } = buildMiniGit([
			['alpha.ts', { x: ' ', y: 'M' }],
			['beta.ts', { x: ' ', y: 'M' }],
			['gamma.ts', { x: '?', y: '?' }],
		]);
		const tracker = createThresholdTracker(runner, { files: 3 });
		const fired = await tracker.check();
		expect(fired).toEqual({
			kind: 'threshold',
			dirtyCount: 3,
			files: { paths: ['alpha.ts', 'beta.ts', 'gamma.ts'] },
		});
		if (fired === null) return;

		// Driver step (x00264): stage the exact set the trigger saw.
		const add = await gitAdd(runner, fired.files.paths);
		expect(add.ok).toBe(true);

		// Driver post-stage check: git diff --cached --name-only ⊆ event.files.
		const cached = await gitCachedNames(runner);
		const expected = new Set(fired.files.paths);
		expect(cached).toHaveLength(fired.files.paths.length);
		for (const name of cached) {
			expect(expected.has(name)).toBe(true);
		}
		expect(cached).toEqual([...expected].sort());
	});

	it('stages all four dirty files when the set crosses threshold at four', async () => {
		const { runner } = buildMiniGit([
			['alpha.ts', { x: ' ', y: 'M' }],
			['beta.ts', { x: ' ', y: 'M' }],
			['delta.ts', { x: 'M', y: 'M' }],
			['gamma.ts', { x: '?', y: '?' }],
		]);
		const tracker = createThresholdTracker(runner, { files: 3 });
		const fired = await tracker.check();
		expect(fired?.dirtyCount).toBe(4);
		expect([...(fired?.files?.paths ?? [])].sort()).toEqual(
			['alpha.ts', 'beta.ts', 'delta.ts', 'gamma.ts'].sort(),
		);
		if (fired === null) return;

		const add = await gitAdd(runner, fired.files.paths);
		expect(add.ok).toBe(true);
		const cached = await gitCachedNames(runner);
		const expected = new Set(fired.files.paths);
		expect(cached).toHaveLength(4);
		for (const name of cached) {
			expect(expected.has(name)).toBe(true);
		}
	});

	it('keeps pre-staged foreign files out of event.files and isolates them as the only extras', async () => {
		const { runner } = buildMiniGit([
			['staged-only.ts', { x: 'A', y: ' ' }],
			['alpha.ts', { x: ' ', y: 'M' }],
			['beta.ts', { x: ' ', y: 'M' }],
			['gamma.ts', { x: '?', y: '?' }],
		]);
		const tracker = createThresholdTracker(runner, { files: 3 });
		const fired = await tracker.check();
		expect(fired?.dirtyCount).toBe(3);
		expect(fired?.files?.paths).not.toContain('staged-only.ts');
		expect([...(fired?.files?.paths ?? [])].sort()).toEqual(
			['alpha.ts', 'beta.ts', 'gamma.ts'].sort(),
		);
		if (fired === null) return;

		const add = await gitAdd(runner, fired.files.paths);
		expect(add.ok).toBe(true);
		const cached = await gitCachedNames(runner);
		const expected = new Set(fired.files.paths);
		const extras = cached.filter((name) => !expected.has(name));
		// The driver's CROSS_AGENT_CONTAMINATION refusal would name exactly
		// the pre-staged foreign file — never a file the trigger saw.
		expect(extras).toEqual(['staged-only.ts']);
		for (const name of cached) {
			expect(expected.has(name) || name === 'staged-only.ts').toBe(true);
		}
	});
});
