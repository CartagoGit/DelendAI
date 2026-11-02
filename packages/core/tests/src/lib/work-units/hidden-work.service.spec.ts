/**
 * hidden-work.service.spec.ts — a stash, a commit never pushed and a
 * change never committed are each named, and work in hand is not.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { hiddenWorkInvariants } from '@delendai/core/lib/work-units/hidden-work.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const UNIT = 'delendai/wip/agent-a/implement/x00001-S1-g1/the-work';

const project = () => {
	const base = mkdtempSync(join(tmpdir(), 'hidden-work-'));
	roots.push(base);
	const forge = join(base, 'origin.git');
	const root = join(base, 'work');
	execFileSync('git', ['init', '-q', '--bare', '-b', 'develop', forge]);
	execFileSync('git', ['init', '-q', '-b', 'develop', root]);
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
	git('config', 'user.email', 'work@example.com');
	git('config', 'user.name', 'Work');
	git('config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, '.gitignore'), 'units/\n');
	writeFileSync(join(root, 'a.txt'), 'a\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'base');
	git('remote', 'add', 'origin', forge);
	git('push', '-q', 'origin', 'develop');
	git('fetch', '-q', 'origin');
	const unit = join(root, 'units', 'one');
	git('worktree', 'add', '-q', unit, '-b', UNIT);
	const inUnit = (...args: string[]) =>
		execFileSync('git', args, { cwd: unit, encoding: 'utf8' }).trim();
	return { root, git, unit, inUnit };
};

const LATER = Math.floor(Date.now() / 1000) + 24 * 3600;

const judge = async (root: string, now?: number) => {
	const results = await hiddenWorkInvariants({
		root,
		remote: 'origin',
		integration: 'develop',
		workPrefix: 'delendai/wip/',
		publicationPrefix: 'delendai/pr/',
		leaseTtlMinutes: 30,
		now,
	});
	return Object.fromEntries(results.map((result) => [result.id, result]));
};

describe('hiddenWorkInvariants', () => {
	it('holds for a clone with a unit that has done nothing yet', async () => {
		const { root } = project();
		const report = await judge(root, LATER);
		expect(Object.values(report).every((result) => result.holds)).toBe(
			true,
		);
	});

	it('names a stash', async () => {
		const { root, git } = project();
		writeFileSync(join(root, 'a.txt'), 'changed\n');
		git('stash', 'push', '-q', '-m', 'set aside');
		const result = (await judge(root))['no-stashed-work'];
		expect(result?.holds).toBe(false);
		expect(result?.observed).toContain('set aside');
	});

	it('names a commit that stayed on this machine, and not one made a moment ago or already pushed', async () => {
		const { root, unit, inUnit } = project();
		writeFileSync(join(unit, 'b.txt'), 'b\n');
		inUnit('add', '-A');
		inUnit('commit', '-q', '-m', 'work');
		// Just made: on its way.
		expect((await judge(root))['units-are-on-the-forge']?.holds).toBe(true);
		const stale = (await judge(root, LATER))['units-are-on-the-forge'];
		expect(stale?.holds).toBe(false);
		expect(stale?.observed).toContain(UNIT);

		inUnit('push', '-q', 'origin', UNIT);
		expect(
			(await judge(root, LATER))['units-are-on-the-forge']?.holds,
		).toBe(true);
	});

	it('names changes a unit left uncommitted, and not a regenerated file or work in hand', async () => {
		const { root, unit } = project();
		writeFileSync(join(unit, 'catalog.generated.json'), '{}\n');
		expect((await judge(root, LATER))['units-are-committed']?.holds).toBe(
			true,
		);

		writeFileSync(join(unit, 'c.txt'), 'never committed\n');
		expect((await judge(root))['units-are-committed']?.holds).toBe(true);
		const left = (await judge(root, LATER))['units-are-committed'];
		expect(left?.holds).toBe(false);
		expect(left?.observed).toContain('1 path(s)');
		expect(left?.remedy).toContain('work retire');
	});
});
