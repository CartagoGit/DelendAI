#!/usr/bin/env bun
/**
 * reclaim-worktrees.script.spec.ts
 *
 * The valuable half is everything the reaper REFUSES: a worktree is
 * somebody's desk, and there is exactly one shape it may clear.
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	statSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import {
	formatReport,
	isRuntimeTree,
	judgeWorktrees,
	proofPidOf,
	parseWorktreeList,
	pathOfStatusLine,
	main,
	observe,
	readDirtyPaths,
	worksomebodyOwns,
	type IWorktree,
} from './reclaim-worktrees.script.ts';

const tree = (over: Partial<IWorktree> = {}): IWorktree => ({
	path: '/repo/.worktrees/w',
	head: 'a'.repeat(40),
	isMain: false,
	isCurrent: false,
	dirtyPaths: 0,
	delivered: true,
	locked: false,
	detached: false,
	headOnRemote: false,
	runtime: false,
	proofHolder: null,
	lastActivityMs: 0,
	...over,
});

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;
const JUDGEMENT = { now: NOW, activeWindowMs: 2 * HOUR } as const;

const roleOf = (over: Partial<IWorktree>): string =>
	judgeWorktrees([tree(over)], JUDGEMENT).verdicts[0]?.role ?? '';

describe('judgeWorktrees: what is not a desk', () => {
	it('[<50ms] never reclaims a runtime tree, however clean and delivered', () => {
		expect(roleOf({ runtime: true })).toBe('runtime');
	});

	it('[<50ms] keeps a proof while its process lives, clears it once it is gone', () => {
		expect(roleOf({ proofHolder: 'live' })).toBe('proving');
		expect(roleOf({ proofHolder: 'dead', delivered: false })).toBe('spent');
		expect(roleOf({ proofHolder: 'dead', dirtyPaths: 2 })).toBe('dirty');
	});

	it('[<50ms] clears a clean detached worktree whose head a remote ref contains', () => {
		expect(
			roleOf({ delivered: false, detached: true, headOnRemote: true }),
		).toBe('spent');
	});

	it('[<50ms] keeps a detached head no remote has, and a branch-attached one', () => {
		expect(roleOf({ delivered: false, detached: true })).toBe(
			'undelivered',
		);
		expect(roleOf({ delivered: false, headOnRemote: true })).toBe(
			'undelivered',
		);
	});

	it('[<50ms] clears an abandoned merge only when both sides are on the remote', () => {
		const merging = {
			delivered: false,
			detached: true,
			dirtyPaths: 3,
			headOnRemote: true,
		};
		expect(roleOf({ ...merging, mergeHead: { onRemote: true } })).toBe(
			'spent',
		);
		expect(roleOf({ ...merging, mergeHead: { onRemote: false } })).toBe(
			'dirty',
		);
		expect(
			roleOf({
				...merging,
				headOnRemote: false,
				mergeHead: { onRemote: true },
			}),
		).toBe('dirty');
	});

	it('[<50ms] recognises runtime trees and proof pids by path', () => {
		expect(isRuntimeTree('/r/.cache/delendai/branch-runtime/develop')).toBe(
			true,
		);
		expect(isRuntimeTree('/r/.cache/delendai/.worktrees/x')).toBe(false);
		expect(
			proofPidOf('/r/.git/delendai-prove/e543d6521698-331629-17941'),
		).toBe(331629);
		expect(proofPidOf('/tmp/candidate-refresh-abc')).toBeNull();
	});
});

describe('judgeWorktrees', () => {
	it('[<50ms] clears a clean worktree the integration branch already contains', () => {
		expect(roleOf({})).toBe('spent');
		expect(judgeWorktrees([tree()], JUDGEMENT).spent).toHaveLength(1);
	});

	describe('what it refuses', () => {
		it('[<50ms] never the main checkout, whatever else is true of it', () => {
			expect(roleOf({ isMain: true })).toBe('main');
			// Even clean and delivered — it is what the human is looking at.
			expect(
				judgeWorktrees([tree({ isMain: true })], JUDGEMENT).spent,
			).toHaveLength(0);
		});

		it('[<50ms] never the worktree it is running from', () => {
			expect(roleOf({ isCurrent: true })).toBe('current');
		});

		it('[<50ms] never one git has locked', () => {
			expect(roleOf({ locked: true })).toBe('locked');
		});

		it('[<50ms] never one with uncommitted work', () => {
			expect(roleOf({ dirtyPaths: 1 })).toBe('dirty');
		});

		it('[<50ms] never one whose uncommitted state git could not read', () => {
			const verdicts = judgeWorktrees(
				[tree({ dirtyPaths: null })],
				JUDGEMENT,
			);
			expect(verdicts.verdicts[0]?.role).toBe('unknown');
			expect(verdicts.spent).toHaveLength(0);
		});

		it('[<50ms] never one whose head the integration branch does not contain', () => {
			expect(roleOf({ delivered: false })).toBe('undelivered');
		});

		it('[<50ms] never one git touched inside the window, clean though it is', () => {
			// The swarm case: agent pushed, desk is clean, everything is
			// delivered — and they are still sitting at it.
			expect(roleOf({ lastActivityMs: NOW - 5 * 60 * 1000 })).toBe(
				'active',
			);
		});

		it('[<50ms] clears one whose last git activity is older than the window', () => {
			expect(roleOf({ lastActivityMs: NOW - 3 * HOUR })).toBe('spent');
		});

		it('[<50ms] treats an unreadable timestamp as no evidence, not as activity', () => {
			// 0 means "cannot tell". Reading it as "active now" would
			// make the reaper a no-op on any worktree whose gitdir it
			// cannot stat; reading it as a real date leaves the content
			// rules to decide, which is what they are for.
			expect(roleOf({ lastActivityMs: 0 })).toBe('spent');
		});

		it('[<50ms] refuses on the FIRST reason, so a locked dirty tree reads as locked', () => {
			// The order is the safety argument: the strongest refusal
			// wins, and none of them can be reached past.
			expect(roleOf({ locked: true, dirtyPaths: 3 })).toBe('locked');
		});
	});
});

describe('worksomebodyOwns', () => {
	it('[<50ms] counts an edited source file', () => {
		expect(worksomebodyOwns([' M packages/core/src/a.ts'])).toBe(1);
	});

	it('[<50ms] does not count a generated artifact', () => {
		// A file this repository regenerates can be rewritten by any
		// command that happens to run. Counting it as work keeps a spent
		// desk forever over a timestamp.
		expect(
			worksomebodyOwns([
				' M packages/core/src/generated/x.generated.ts',
				' M docs/delendai/host-hints/y.md',
			]),
		).toBe(0);
	});

	it('[<50ms] counts the source file and not the generated one beside it', () => {
		expect(
			worksomebodyOwns([
				' M packages/core/src/generated/x.generated.ts',
				'?? packages/core/src/b.ts',
			]),
		).toBe(1);
	});

	it('[<50ms] counts an edit to the hand-written bootstrap as work', () => {
		expect(worksomebodyOwns([' M docs/delendai/AGENT-BOOTSTRAP.md'])).toBe(
			1,
		);
	});
});

describe('pathOfStatusLine', () => {
	it('[<50ms] drops the two status columns', () => {
		expect(pathOfStatusLine(' M src/a.ts')).toBe('src/a.ts');
		expect(pathOfStatusLine('?? src/b.ts')).toBe('src/b.ts');
	});

	it('[<50ms] takes the destination of a rename', () => {
		expect(pathOfStatusLine('R  src/old.ts -> src/new.ts')).toBe(
			'src/new.ts',
		);
	});
});

describe('parseWorktreeList', () => {
	it('[<50ms] reads path, head and the lock flag', () => {
		const parsed = parseWorktreeList(
			[
				'worktree /repo',
				`HEAD ${'a'.repeat(40)}`,
				'branch refs/heads/develop',
				'',
				'worktree /repo/.worktrees/w',
				`HEAD ${'b'.repeat(40)}`,
				'detached',
				'locked',
				'',
			].join('\n'),
		);

		expect(parsed).toEqual([
			{
				path: '/repo',
				head: 'a'.repeat(40),
				locked: false,
				detached: false,
			},
			{
				path: '/repo/.worktrees/w',
				head: 'b'.repeat(40),
				locked: true,
				detached: true,
			},
		]);
	});

	it('[<50ms] reads a lock that carries a reason', () => {
		const parsed = parseWorktreeList(
			['worktree /repo/w', 'locked somebody is using it', ''].join('\n'),
		);

		expect(parsed[0]?.locked).toBe(true);
	});
});

describe('formatReport', () => {
	it('[<50ms] tells a dry run how to act', () => {
		const report = formatReport(judgeWorktrees([tree()], JUDGEMENT), false);

		expect(report).toContain('--apply');
	});

	it('[<50ms] says what it removed after acting', () => {
		expect(
			formatReport(judgeWorktrees([tree()], JUDGEMENT), true),
		).toContain('removed 1 spent worktree(s)');
	});

	it('[<50ms] says plainly when there is nothing to do', () => {
		expect(
			formatReport(
				judgeWorktrees([tree({ isMain: true })], JUDGEMENT),
				false,
			),
		).toContain('nothing to reclaim');
	});
});

describe('readDirtyPaths', () => {
	it('[<50ms] is null, not zero, when git status cannot run', () => {
		expect(
			readDirtyPaths('/nonexistent/delendai-no-such-worktree'),
		).toBeNull();
	});
});

describe('observe and main over a real repository', () => {
	const sandbox = realpathSync(
		mkdtempSync(join(tmpdir(), 'delendai-x01026-')),
	);
	afterAll(() => rmSync(sandbox, { recursive: true, force: true }));
	const git = (cwd: string, ...args: string[]): string =>
		execFileSync('git', args, { cwd, encoding: 'utf8' });

	const root = join(sandbox, 'main');
	mkdirSync(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'a@b.c');
	git(root, 'config', 'user.name', 'n');
	writeFileSync(join(root, 'a.txt'), 'a\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-qm', 'a');
	git(root, 'update-ref', 'refs/remotes/origin/develop', 'HEAD');

	const addTree = (name: string): string => {
		const path = join(sandbox, name);
		git(root, 'worktree', 'add', '-q', '--detach', path, 'HEAD');
		return path;
	};
	const age = (path: string): void => {
		const gitDir = git(path, 'rev-parse', '--absolute-git-dir').trim();
		const old = new Date(Date.now() - 48 * HOUR);
		// Files older than the index, or git status rewrites it as racy.
		const older = new Date(Date.now() - 49 * HOUR);
		utimesSync(join(path, 'a.txt'), older, older);
		for (const file of ['index', 'HEAD']) {
			utimesSync(join(gitDir, file), old, old);
		}
	};

	const spent = addTree('spent');
	age(spent);
	const dirty = addTree('dirty');
	writeFileSync(join(dirty, 'wip.txt'), 'half done\n');
	age(dirty);
	const broken = addTree('broken');
	writeFileSync(join(broken, '.git'), 'gitdir: /nonexistent/nowhere\n');

	it('[<1000ms] observe reads dirt, delivery and an unreadable status as unknown', () => {
		// Every case starts from a freshly aged worktree: `git status`
		// refreshes the index whose mtime says when git last worked there,
		// so an earlier `observe` in this file leaves the next one reading
		// a worktree that looks busy.
		age(spent);
		age(dirty);
		const byPath = new Map(
			observe('origin/develop', root, root).map((t) => [t.path, t]),
		);
		expect(byPath.get(root)?.isMain).toBe(true);
		expect(byPath.get(spent)).toMatchObject({
			dirtyPaths: 0,
			delivered: true,
		});
		expect(byPath.get(dirty)?.dirtyPaths).toBe(1);
		expect(byPath.get(broken)?.dirtyPaths).toBeNull();
	});

	it('[<1000ms] judges a worktree spent even though it read its status', () => {
		// The reaper reads the status of every worktree, and `git status`
		// refreshes the index whose mtime says when git last worked there.
		// A worktree nobody has touched for longer than the window is
		// still spent: the reaper measured the activity before it touched
		// anything.
		//
		// This case runs before the one that removes the spent worktree,
		// because that one leaves it gone.
		age(spent);
		age(dirty);
		const verdicts = judgeWorktrees(observe('origin/develop', root, root));
		const byPath = new Map(verdicts.verdicts.map((v) => [v.path, v]));

		expect(byPath.get(spent)?.role).toBe('spent');
		expect(byPath.get(dirty)?.role).toBe('dirty');
		expect(byPath.get(broken)?.role).toBe('unknown');
	});

	it('[<200ms] reads a status without touching the index that dates the activity', () => {
		// Root cause of the CI flake (run 42364090265): a plain `git status`
		// rewrites an old index, so the dry run made the spent worktree look
		// busy to the run that applies.
		age(spent);
		const gitDir = git(spent, 'rev-parse', '--absolute-git-dir').trim();
		const before = statSync(join(gitDir, 'index')).mtimeMs;
		readDirtyPaths(spent);
		expect(statSync(join(gitDir, 'index')).mtimeMs).toBe(before);
	});

	it('[<3000ms] main only reports without apply, and with apply removes just the spent one', () => {
		// The worktree is aged here, not in the setup above: the case
		// before this one read its status, which refreshed the index.
		age(spent);
		const log = vi
			.spyOn(console, 'log')
			.mockImplementation(() => undefined);
		try {
			expect(main(root, false, 'origin/develop')).toBe(0);
			expect(existsSync(spent)).toBe(true);
			expect(main(root, true, 'origin/develop')).toBe(0);
		} finally {
			log.mockRestore();
		}
		expect(existsSync(spent)).toBe(false);
		expect(existsSync(dirty)).toBe(true);
		expect(existsSync(broken)).toBe(true);
	});
});
