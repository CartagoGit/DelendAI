#!/usr/bin/env bun
/**
 * reclaim-worktrees.script.spec.ts
 *
 * The valuable half is everything the reaper REFUSES: a worktree is
 * somebody's desk, and there is exactly one shape it may clear.
 */
import { describe, expect, it } from 'vitest';

import {
	formatReport,
	judgeWorktrees,
	parseWorktreeList,
	pathOfStatusLine,
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
	lastActivityMs: 0,
	...over,
});

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;
const JUDGEMENT = { now: NOW, activeWindowMs: 2 * HOUR } as const;

const roleOf = (over: Partial<IWorktree>): string =>
	judgeWorktrees([tree(over)], JUDGEMENT).verdicts[0]?.role ?? '';

describe('judgeWorktrees', () => {
	it('clears a clean worktree the integration branch already contains', () => {
		expect(roleOf({})).toBe('spent');
		expect(judgeWorktrees([tree()], JUDGEMENT).spent).toHaveLength(1);
	});

	describe('what it refuses', () => {
		it('never the main checkout, whatever else is true of it', () => {
			expect(roleOf({ isMain: true })).toBe('main');
			// Even clean and delivered — it is what the human is looking at.
			expect(
				judgeWorktrees([tree({ isMain: true })], JUDGEMENT).spent,
			).toHaveLength(0);
		});

		it('never the worktree it is running from', () => {
			expect(roleOf({ isCurrent: true })).toBe('current');
		});

		it('never one git has locked', () => {
			expect(roleOf({ locked: true })).toBe('locked');
		});

		it('never one with uncommitted work', () => {
			expect(roleOf({ dirtyPaths: 1 })).toBe('dirty');
		});

		it('never one whose head the integration branch does not contain', () => {
			expect(roleOf({ delivered: false })).toBe('undelivered');
		});

		it('never one git touched inside the window, clean though it is', () => {
			// The swarm case: agent pushed, desk is clean, everything is
			// delivered — and they are still sitting at it.
			expect(roleOf({ lastActivityMs: NOW - 5 * 60 * 1000 })).toBe(
				'active',
			);
		});

		it('clears one whose last git activity is older than the window', () => {
			expect(roleOf({ lastActivityMs: NOW - 3 * HOUR })).toBe('spent');
		});

		it('treats an unreadable timestamp as no evidence, not as activity', () => {
			// 0 means "cannot tell". Reading it as "active now" would
			// make the reaper a no-op on any worktree whose gitdir it
			// cannot stat; reading it as a real date leaves the content
			// rules to decide, which is what they are for.
			expect(roleOf({ lastActivityMs: 0 })).toBe('spent');
		});

		it('refuses on the FIRST reason, so a locked dirty tree reads as locked', () => {
			// The order is the safety argument: the strongest refusal
			// wins, and none of them can be reached past.
			expect(roleOf({ locked: true, dirtyPaths: 3 })).toBe('locked');
		});
	});
});

describe('worksomebodyOwns', () => {
	it('counts an edited source file', () => {
		expect(worksomebodyOwns([' M packages/core/src/a.ts'])).toBe(1);
	});

	it('does not count a generated artifact', () => {
		// A file this repository regenerates can be rewritten by any
		// command that happens to run. Counting it as work keeps a spent
		// desk forever over a timestamp.
		expect(
			worksomebodyOwns([
				' M docs/delendai/AGENT-BOOTSTRAP.md',
				' M packages/core/src/generated/x.generated.ts',
				' M docs/delendai/host-hints/y.md',
			]),
		).toBe(0);
	});

	it('counts the source file and not the generated one beside it', () => {
		expect(
			worksomebodyOwns([
				' M docs/delendai/AGENT-BOOTSTRAP.md',
				'?? packages/core/src/b.ts',
			]),
		).toBe(1);
	});
});

describe('pathOfStatusLine', () => {
	it('drops the two status columns', () => {
		expect(pathOfStatusLine(' M src/a.ts')).toBe('src/a.ts');
		expect(pathOfStatusLine('?? src/b.ts')).toBe('src/b.ts');
	});

	it('takes the destination of a rename', () => {
		expect(pathOfStatusLine('R  src/old.ts -> src/new.ts')).toBe(
			'src/new.ts',
		);
	});
});

describe('parseWorktreeList', () => {
	it('reads path, head and the lock flag', () => {
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
			{ path: '/repo', head: 'a'.repeat(40), locked: false },
			{
				path: '/repo/.worktrees/w',
				head: 'b'.repeat(40),
				locked: true,
			},
		]);
	});

	it('reads a lock that carries a reason', () => {
		const parsed = parseWorktreeList(
			['worktree /repo/w', 'locked somebody is using it', ''].join('\n'),
		);

		expect(parsed[0]?.locked).toBe(true);
	});
});

describe('formatReport', () => {
	it('tells a dry run how to act', () => {
		const report = formatReport(judgeWorktrees([tree()], JUDGEMENT), false);

		expect(report).toContain('--apply');
	});

	it('says what it removed after acting', () => {
		expect(
			formatReport(judgeWorktrees([tree()], JUDGEMENT), true),
		).toContain('removed 1 spent worktree(s)');
	});

	it('says plainly when there is nothing to do', () => {
		expect(
			formatReport(
				judgeWorktrees([tree({ isMain: true })], JUDGEMENT),
				false,
			),
		).toContain('nothing to reclaim');
	});
});
