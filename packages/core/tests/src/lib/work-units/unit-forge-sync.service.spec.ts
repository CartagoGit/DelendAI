/**
 * unit-forge-sync.service.spec.ts — a start on either machine leaves the
 * units in step with the forge, and overwrites nothing.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
