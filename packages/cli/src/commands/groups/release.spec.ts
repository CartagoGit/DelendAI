/**
 * release.spec.ts — `release promote` and `release follow` against real
 * git repositories: a bare origin and a clone, no forge.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fakePartial } from '@delendai/test-kit';
import { afterEach, describe, expect, it } from 'vitest';

import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type { ICliCommandContext } from '../../contracts/interfaces/cli-command.interface';
import { releaseFollowCommand, releasePromoteCommand } from './release';

const git = (cwd: string, ...args: string[]) =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const made: string[] = [];
afterEach(() => {
	for (const dir of made.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

/** origin with `main` and `develop` level, cloned, rules in the config. */
const project = (rules: Record<string, unknown>) => {
	const base = mkdtempSync(join(tmpdir(), 'release-spec-'));
	made.push(base);
	const origin = join(base, 'origin.git');
	const work = join(base, 'work');
	git(base, 'init', '--bare', '-b', 'main', origin);
	git(base, 'clone', '-q', origin, work);
	git(work, 'config', 'user.email', 'a@b.c');
	git(work, 'config', 'user.name', 'a');
	git(work, 'config', 'commit.gpgsign', 'false');
	writeFileSync(
		join(work, 'delendai.config.json'),
		JSON.stringify({
			development: {
				profile: 'shared-checkout-merge',
				branches: { rules },
			},
		}),
	);
	git(work, 'add', '.');
	git(work, 'commit', '-qm', 'init');
	git(work, 'push', '-q', 'origin', 'HEAD:main', 'HEAD:develop');
	return { work, origin };
};

const ctxOf = (cwd: string) =>
	fakePartial<ICliCommandContext>({
		cwd,
		globals: fakePartial<ICliCommandContext['globals']>({ workspace: '' }),
	});

describe('release commands', () => {
	it('promote needs a branch', async () => {
		const { work } = project({});
		const result = await releasePromoteCommand.run([], ctxOf(work));
		expect(result.code).toBe(EXIT_CODE.USAGE);
	});

	it('promote refuses a branch that names no source', async () => {
		const { work } = project({});
		const result = await releasePromoteCommand.run(['main'], ctxOf(work));
		expect(result.code).toBe(EXIT_CODE.VALIDATION);
		expect(result.text).toContain('promotedFrom');
	});

	it('follow does nothing when the follower already has the source', async () => {
		const { work } = project({
			develop: { takesIn: 'merge', follows: 'main' },
		});
		const result = await releaseFollowCommand.run([], ctxOf(work));
		expect(result.code).toBe(EXIT_CODE.OK);
		expect(result.text).toContain('nothing');
	});

	it('follow merges the source into a merge follower and pushes it', async () => {
		const { work, origin } = project({
			develop: { takesIn: 'merge', follows: 'main' },
		});
		git(work, 'checkout', '-q', 'main');
		writeFileSync(join(work, 'hotfix.txt'), 'fix');
		git(work, 'add', '.');
		git(work, 'commit', '-qm', 'fix: hotfix');
		git(work, 'push', '-q', 'origin', 'main');
		const result = await releaseFollowCommand.run([], ctxOf(work));
		expect(result.code).toBe(EXIT_CODE.OK);
		expect(result.text).toContain('merged');
		expect(git(origin, 'ls-tree', '--name-only', 'develop')).toContain(
			'hotfix.txt',
		);
	});
});
