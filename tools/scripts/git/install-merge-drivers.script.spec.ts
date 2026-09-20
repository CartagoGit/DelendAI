import { execFileSync } from 'node:child_process';
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { GENERATED_MERGE_DRIVER } from './install-merge-drivers.constant';
import {
	declaredPaths,
	driverCommandFor,
	installMergeDrivers,
	pinnedRoot,
} from './install-merge-drivers.script';

const roots: string[] = [];
afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const tryMerge = (cwd: string, ref: string): boolean => {
	try {
		execFileSync('git', ['merge', '--no-edit', ref], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		return true;
	} catch {
		return false;
	}
};

/**
 * A repository shaped like this one: a tracked `.gitattributes` routing a
 * generated file through the driver, and two branches that each
 * regenerated it — which is what every pair of candidates looks like.
 */
const repoWithTwoRegenerations = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'merge-driver-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'd@example.invalid');
	git(root, 'config', 'user.name', 'D');
	git(root, 'config', 'commit.gpgsign', 'false');

	writeFileSync(
		join(root, '.gitattributes'),
		`generated.txt merge=${GENERATED_MERGE_DRIVER}\n`,
	);
	writeFileSync(join(root, 'generated.txt'), 'count: 1\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');

	git(root, 'switch', '-q', '-c', 'a');
	writeFileSync(join(root, 'generated.txt'), 'count: 2\n');
	git(root, 'commit', '-q', '-am', 'a regenerates');

	git(root, 'switch', '-q', 'develop');
	writeFileSync(join(root, 'generated.txt'), 'count: 3\n');
	git(root, 'commit', '-q', '-am', 'develop regenerates');
	return root;
};

/** A stand-in driver: it writes the regenerated truth, and succeeds. */
const installStandIn = (root: string): void => {
	const bin = join(root, 'driver.sh');
	writeFileSync(bin, '#!/bin/sh\necho "count: regenerated" > "$2"\nexit 0\n');
	chmodSync(bin, 0o755);
	git(
		root,
		'config',
		`merge.${GENERATED_MERGE_DRIVER}.driver`,
		`${bin} %O %A %B %P`,
	);
};

describe('install-merge-drivers (x00574)', () => {
	it('reads which paths .gitattributes routes through the driver', () => {
		const root = repoWithTwoRegenerations();
		expect(declaredPaths(root)).toEqual(['generated.txt']);
	});

	it('is the difference between a conflict and a clean merge', () => {
		// Without the driver, git falls back to a textual merge of
		// generated output — which is exactly what made every pair of
		// candidates in this repository "not merge trivially".
		const without = repoWithTwoRegenerations();
		expect(tryMerge(without, 'a')).toBe(false);
		expect(readFileSync(join(without, 'generated.txt'), 'utf8')).toContain(
			'<<<<<<<',
		);

		const withDriver = repoWithTwoRegenerations();
		installStandIn(withDriver);
		expect(tryMerge(withDriver, 'a')).toBe(true);
		expect(
			readFileSync(join(withDriver, 'generated.txt'), 'utf8'),
		).toContain('regenerated');
	});

	it('reports the driver as missing before it installs it', () => {
		const root = repoWithTwoRegenerations();
		const looked = installMergeDrivers({ cwd: root });
		expect(looked.installed).toBe(false);
		expect(looked.changed).toBe(false);
		expect(looked.found).toBe('');
		expect(looked.paths).toEqual(['generated.txt']);
	});

	it('installs it, and says so, and does not install it twice', () => {
		const root = repoWithTwoRegenerations();
		const first = installMergeDrivers({ cwd: root, apply: true });
		expect(first.installed).toBe(true);
		expect(first.changed).toBe(true);
		expect(first.found).toBe(driverCommandFor(root));

		const second = installMergeDrivers({ cwd: root, apply: true });
		expect(second.installed).toBe(true);
		expect(second.changed).toBe(false);
	});

	it('replaces a driver pointing at another checkout', () => {
		// The path is absolute, so a config copied from elsewhere — or
		// left behind by a worktree that has been removed — points at a
		// script that is not there.
		const root = repoWithTwoRegenerations();
		git(
			root,
			'config',
			`merge.${GENERATED_MERGE_DRIVER}.driver`,
			'/somewhere/else/driver %O %A %B %P',
		);
		const report = installMergeDrivers({ cwd: root, apply: true });
		expect(report.changed).toBe(true);
		expect(report.found).toBe(driverCommandFor(root));
	});

	it('configures it where every worktree will find it', () => {
		// `merge.*` resolves from the COMMON config, so one install covers
		// the pinned checkout and every worktree made from it — which is
		// where the agents actually merge.
		const root = repoWithTwoRegenerations();
		installMergeDrivers({ cwd: root, apply: true });
		const wt = join(root, 'wt');
		git(root, 'worktree', 'add', '-q', wt, '-b', 'work');
		expect(
			git(
				wt,
				'config',
				'--get',
				`merge.${GENERATED_MERGE_DRIVER}.driver`,
			),
		).toBe(driverCommandFor(root));
		expect(pinnedRoot(wt)).toBe(root);
	});

	it('does nothing when .gitattributes routes nothing through it', () => {
		const root = mkdtempSync(join(tmpdir(), 'merge-driver-none-'));
		roots.push(root);
		git(root, 'init', '-q', '-b', 'develop');
		mkdirSync(join(root, 'sub'), { recursive: true });
		expect(declaredPaths(root)).toEqual([]);
	});
});
