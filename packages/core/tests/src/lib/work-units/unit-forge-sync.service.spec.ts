/**
 * unit-forge-sync.service.spec.ts — a start on either machine leaves the
 * units in step with the forge, and overwrites nothing.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { createGitRunner } from '@delendai/core/lib/shared/git-write';
import { unitsOnForgeInvariant } from '@delendai/core/lib/work-units/units-on-forge.service';
import {
	syncUnitsAtStart,
	syncUnitsWithForge,
} from '@delendai/core/lib/work-units/unit-forge-sync.service';

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});
const BRANCH = 'delendai/wip/agent/implement/x1-all-g1/topic';

describe('syncUnitsWithForge', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});
	const git = (cwd: string, ...args: string[]): string =>
		execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
	const machines = () => {
		const top = mkdtempSync(join(tmpdir(), 'forge-sync-'));
		dirs.push(top);
		const remote = join(top, 'forge.git');
		git(top, 'init', '-q', '--bare', '-b', 'develop', remote);
		const clone = (name: string): string => {
			const root = join(top, name);
			git(top, 'clone', '-q', remote, root);
			git(root, 'config', 'user.name', 'spec');
			git(root, 'config', 'user.email', 'spec@example.invalid');
			return root;
		};
		const home = clone('home');
		writeFileSync(join(home, 'a.txt'), 'a\n');
		git(home, 'add', '-A');
		git(home, 'commit', '-q', '-m', 'base');
		git(home, 'push', '-q', 'origin', 'HEAD:develop');
		const office = clone('office');
		return { top, remote, home, office };
	};
	const sync = (
		root: string,
		isLive: (branch: string) => boolean = () => false,
	) =>
		syncUnitsWithForge({
			run: createGitRunner(root),
			runIn: (cwd) => createGitRunner(cwd),
			policy,
			remote: 'origin',
			isLive,
		});

	it('pushes what one machine holds, and creates it on the other', async () => {
		const { top, remote, home, office } = machines();
		const unit = join(top, 'home-unit');
		git(home, 'worktree', 'add', '-q', '-b', BRANCH, unit);
		writeFileSync(join(unit, 'b.txt'), 'b\n');
		git(unit, 'add', '-A');
		git(unit, 'commit', '-q', '-m', 'work at home');

		expect(await sync(home)).toEqual([
			{ branch: BRANCH, outcome: 'pushed' },
		]);
		expect(git(remote, 'rev-parse', BRANCH)).toBe(
			git(unit, 'rev-parse', 'HEAD'),
		);
		expect(await sync(office)).toEqual([
			{ branch: BRANCH, outcome: 'fetched' },
		]);
		expect(git(office, 'rev-parse', BRANCH)).toBe(
			git(unit, 'rev-parse', 'HEAD'),
		);

		// More work at home; the office's copy follows it.
		writeFileSync(join(unit, 'c.txt'), 'c\n');
		git(unit, 'add', '-A');
		git(unit, 'commit', '-q', '-m', 'more at home');
		await sync(home);
		expect(await sync(office)).toEqual([
			{ branch: BRANCH, outcome: 'fast-forwarded' },
		]);
		expect(await sync(office)).toEqual([]);
	});

	it('keeps the uncommitted edits of a unit nobody works in, and leaves a live one alone', async () => {
		const { top, remote, home } = machines();
		const unit = join(top, 'home-unit');
		git(home, 'worktree', 'add', '-q', '-b', BRANCH, unit);
		writeFileSync(join(unit, 'draft.txt'), 'unfinished\n');

		expect(await sync(home, () => true)).toEqual([
			{ branch: BRANCH, outcome: 'pushed' },
		]);
		expect(git(unit, 'status', '--porcelain')).toContain('draft.txt');

		const kept = await sync(home);
		expect(kept).toEqual([
			{ branch: BRANCH, outcome: 'kept-uncommitted' },
			{ branch: BRANCH, outcome: 'pushed' },
		]);
		expect(git(unit, 'status', '--porcelain')).toBe('');
		expect(git(remote, 'show', `${BRANCH}:draft.txt`)).toBe('unfinished');
	});

	/** A unit with a merge begun, conflicts resolved, not committed. */
	const mergeInProgress = () => {
		const made = machines();
		const unit = join(made.top, 'home-unit');
		git(made.home, 'worktree', 'add', '-q', '-b', BRANCH, unit);
		git(unit, 'config', 'user.name', 'spec');
		git(unit, 'config', 'user.email', 'spec@example.invalid');
		writeFileSync(join(unit, 'a.txt'), 'mine\n');
		git(unit, 'commit', '-q', '-am', 'mine');
		git(made.home, 'checkout', '-q', '-b', 'other');
		writeFileSync(join(made.home, 'a.txt'), 'theirs\n');
		git(made.home, 'commit', '-q', '-am', 'theirs');
		git(made.home, 'checkout', '-q', 'develop');
		try {
			git(unit, 'merge', '--no-commit', 'other');
		} catch {
			// the conflict is the point
		}
		writeFileSync(join(unit, 'a.txt'), 'resolved\n');
		git(unit, 'add', 'a.txt');
		return {
			...made,
			unit,
			head: git(unit, 'rev-parse', '--short', 'MERGE_HEAD'),
		};
	};

	it('leaves a merge in progress alone while its unit is live (x01051)', async () => {
		const { unit, home } = mergeInProgress();
		const before = git(unit, 'rev-parse', 'HEAD');
		await sync(home, () => true);
		expect(git(unit, 'rev-parse', 'HEAD')).toBe(before);
		expect(git(unit, 'rev-parse', '--verify', 'MERGE_HEAD')).not.toBe('');
		expect(git(unit, 'log', '-1', '--format=%s')).toBe('mine');
	});

	it('keeps a merge in progress of a unit nobody works in, under a message that names it (x01051)', async () => {
		const { unit, home, head } = mergeInProgress();
		const kept = await sync(home);
		expect(kept[0]).toEqual({
			branch: BRANCH,
			outcome: 'kept-uncommitted',
		});
		expect(git(unit, 'log', '-1', '--format=%s')).toBe(
			`chore(wip): keep the merge of ${head} found at start`,
		);
		expect(
			git(unit, 'rev-list', '--parents', '-1', 'HEAD').split(' '),
		).toHaveLength(3);
	});

	it('leaves a rebase or cherry-pick of a unit nobody works in as it is (x01051)', async () => {
		const { unit, home } = mergeInProgress();
		git(unit, 'merge', '--abort');
		try {
			git(unit, 'cherry-pick', 'other');
		} catch {
			// it stops on the conflict, with CHERRY_PICK_HEAD set
		}
		const result = await sync(home);
		expect(result[0]).toMatchObject({ outcome: 'failed' });
		expect(result[0]?.detail).toContain('left as it is');
	});

	it('does not keep a lost checkout: an emptied tree is neither committed nor pushed', async () => {
		const { top, remote, home } = machines();
		const unit = join(top, 'home-unit');
		git(home, 'worktree', 'add', '-q', '-b', BRANCH, unit);
		writeFileSync(join(unit, 'b.txt'), 'b\n');
		git(unit, 'add', '-A');
		git(unit, 'commit', '-q', '-m', 'work at home');
		await sync(home);
		const tip = git(unit, 'rev-parse', 'HEAD');
		for (const name of ['a.txt', 'b.txt']) rmSync(join(unit, name));

		const [reported] = await sync(home);
		expect(reported).toMatchObject({ branch: BRANCH, outcome: 'failed' });
		expect(reported?.detail).toContain('lost 2 of the 2 files');
		expect(git(unit, 'rev-parse', 'HEAD')).toBe(tip);
		expect(git(remote, 'rev-parse', BRANCH)).toBe(tip);
	});

	it('still keeps a small deletion as uncommitted work', async () => {
		const { top, home } = machines();
		const unit = join(top, 'home-unit');
		git(home, 'worktree', 'add', '-q', '-b', BRANCH, unit);
		for (const name of ['b.txt', 'c.txt', 'd.txt'])
			writeFileSync(join(unit, name), `${name}\n`);
		git(unit, 'add', '-A');
		git(unit, 'commit', '-q', '-m', 'work at home');
		rmSync(join(unit, 'b.txt'));

		expect(await sync(home)).toEqual([
			{ branch: BRANCH, outcome: 'kept-uncommitted' },
			{ branch: BRANCH, outcome: 'pushed' },
		]);
	});

	it('reports a branch that moved on both machines, and overwrites neither', async () => {
		const { top, remote, home, office } = machines();
		const unit = join(top, 'home-unit');
		git(home, 'worktree', 'add', '-q', '-b', BRANCH, unit);
		writeFileSync(join(unit, 'b.txt'), 'b\n');
		git(unit, 'add', '-A');
		git(unit, 'commit', '-q', '-m', 'work at home');
		await sync(home);
		await sync(office);
		const there = join(top, 'office-unit');
		git(office, 'worktree', 'add', '-q', there, BRANCH);
		writeFileSync(join(there, 'o.txt'), 'o\n');
		git(there, 'add', '-A');
		git(there, 'commit', '-q', '-m', 'work at the office');
		await sync(office);
		writeFileSync(join(unit, 'h.txt'), 'h\n');
		git(unit, 'add', '-A');
		git(unit, 'commit', '-q', '-m', 'more at home');
		const before = git(remote, 'rev-parse', BRANCH);

		const [reported] = await sync(home);
		expect(reported).toMatchObject({ branch: BRANCH, outcome: 'diverged' });
		expect(reported?.repair).toContain(`fetch origin ${BRANCH}`);
		expect(git(remote, 'rev-parse', BRANCH)).toBe(before);
	});

	it('does nothing at start when switched off, or without a forge', async () => {
		const { home } = machines();
		expect(
			await syncUnitsAtStart({
				root: home,
				policy,
				env: { DELENDAI_UNIT_FORGE_SYNC: 'off' },
			}),
		).toEqual([]);
		const lonely = mkdtempSync(join(tmpdir(), 'forge-sync-none-'));
		dirs.push(lonely);
		git(lonely, 'init', '-q', '-b', 'develop');
		expect(
			await syncUnitsAtStart({ root: lonely, policy, env: {} }),
		).toEqual([]);
	});

	it('publishes at start a unit whose proposal left in-progress and that holds work the forge lacks', async () => {
		const { top, home } = machines();
		const unit = join(top, 'home-unit');
		git(home, 'worktree', 'add', '-q', '-b', BRANCH, unit);
		const docs = join(unit, 'docs/delendai/proposals');
		mkdirSync(join(docs, 'in-progress'), { recursive: true });
		mkdirSync(join(docs, 'review'), { recursive: true });
		writeFileSync(join(docs, 'in-progress/x1-topic.md'), '# x1\n');
		writeFileSync(join(unit, 'work.txt'), 'work\n');
		git(unit, 'add', '-A');
		const longAgo = {
			GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
			GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
		};
		const old = (...args: string[]): string =>
			execFileSync('git', args, {
				cwd: unit,
				encoding: 'utf8',
				env: { ...process.env, ...longAgo },
			}).trim();
		old('commit', '-q', '-m', 'work while in progress');
		git(
			unit,
			'mv',
			'docs/delendai/proposals/in-progress/x1-topic.md',
			'docs/delendai/proposals/review/x1-topic.md',
		);
		old('commit', '-q', '-m', 'the proposal moves to review');

		const written: string[] = [];
		const done = await syncUnitsAtStart({
			root: home,
			policy,
			env: {},
			write: (line) => written.push(line),
		});
		const outOfProgress = done.filter(
			(each) =>
				each.branch === BRANCH &&
				(each.outcome === 'published' || each.outcome === 'failed') &&
				(each.detail ?? '').includes('out of progress') !==
					(each.outcome === 'published'),
		);
		expect(outOfProgress).not.toEqual([]);
	});

	it('tells the doctor which units hold work the forge lacks', async () => {
		const { top, home } = machines();
		const unit = join(top, 'home-unit');
		git(home, 'worktree', 'add', '-q', '-b', BRANCH, unit);
		writeFileSync(join(unit, 'b.txt'), 'b\n');
		git(unit, 'add', '-A');
		git(unit, 'commit', '-q', '-m', 'work at home');
		const judged = () =>
			unitsOnForgeInvariant({
				root: home,
				remote: 'origin',
				integration: 'develop',
				workPrefix: 'delendai/wip/',
			});
		expect(judged()).toMatchObject({
			holds: false,
			observed: expect.stringContaining('1 commit(s) only here'),
		});
		await sync(home);
		expect(judged().holds).toBe(true);
		writeFileSync(join(unit, 'c.txt'), 'c\n');
		expect(judged().observed).toContain('1 uncommitted change(s)');
	});

	it('reports a forge it cannot reach, and changes nothing', async () => {
		const { home } = machines();
		const synced = await syncUnitsWithForge({
			run: createGitRunner(home),
			runIn: (cwd) => createGitRunner(cwd),
			policy,
			remote: 'nowhere',
			isLive: () => false,
		});
		expect(synced).toEqual([
			expect.objectContaining({ outcome: 'failed' }),
		]);
	});

	it('says at start, on stderr, what it could not do', async () => {
		const { home } = machines();
		git(
			home,
			'remote',
			'set-url',
			'origin',
			join(home, 'no-forge-here.git'),
		);
		const written: string[] = [];
		const spy = vi
			.spyOn(process.stderr, 'write')
			.mockImplementation((chunk: string | Uint8Array) => {
				written.push(String(chunk));
				return true;
			});
		try {
			await syncUnitsAtStart({ root: home, policy, env: {} });
		} finally {
			spy.mockRestore();
		}
		expect(written.join('')).toContain('failed');
	});
});
