/**
 * git-seam.spec.ts — the start-up fetch brings the release tags.
 *
 * A version reaching main is tagged on the forge; a checkout that never
 * fetched the tag shows no version in its history. Driven against real
 * git, because the claim is about the refs a fetch leaves behind.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type {
	IGitRunner,
	IGitRunResult,
} from '@delendai/core/lib/contracts/interfaces/git-runner.interface';
import { createStartupGitSeam } from '@delendai/core/lib/startup-reconciler/git-seam';

const roots: string[] = [];

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const runnerFor =
	(cwd: string): IGitRunner =>
	async (args: readonly string[]): Promise<IGitRunResult> => {
		try {
			return {
				ok: true,
				output: execFileSync('git', [...args], {
					cwd,
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'pipe'],
				}),
			};
		} catch (error) {
			return {
				ok: false,
				output: '',
				reason: error instanceof Error ? error.message : 'git failed',
			};
		}
	};

const identify = (dir: string): void => {
	git(dir, 'config', 'user.email', 'tags@example.com');
	git(dir, 'config', 'user.name', 'Tags');
	git(dir, 'config', 'commit.gpgsign', 'false');
	git(dir, 'config', 'tag.gpgsign', 'false');
};

/** A seed that pushes to a bare origin, and a clone of it. */
const repos = (): { readonly seed: string; readonly work: string } => {
	const root = mkdtempSync(join(tmpdir(), 'git-seam-tags-'));
	roots.push(root);
	const origin = join(root, 'origin.git');
	const seed = join(root, 'seed');
	const work = join(root, 'work');
	execFileSync('mkdir', ['-p', origin, seed]);
	git(origin, 'init', '-q', '--bare', '--initial-branch', 'develop');
	git(seed, 'init', '-q', '--initial-branch', 'develop');
	identify(seed);
	writeFileSync(join(seed, 'a.ts'), 'export const a = 1;\n');
	git(seed, 'add', '-A');
	git(seed, 'commit', '-q', '--no-verify', '-m', 'base');
	git(seed, 'remote', 'add', 'origin', origin);
	git(seed, 'push', '-q', 'origin', 'develop');
	git(root, 'clone', '-q', '--no-tags', origin, work);
	identify(work);
	return { seed, work };
};

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

describe('the start-up fetch', () => {
	it('brings a release tag the remote gained, and keeps a tag only the checkout has', async () => {
		const { seed, work } = repos();
		// On a commit develop does not have, as a release on main is: a fetch
		// of develop alone would never follow it.
		git(seed, 'checkout', '-q', '-b', 'main');
		git(
			seed,
			'commit',
			'-q',
			'--no-verify',
			'--allow-empty',
			'-m',
			'release',
		);
		git(seed, 'tag', '-a', 'v9.9.9', '-m', 'delendai 9.9.9');
		git(seed, 'push', '-q', 'origin', 'v9.9.9');
		git(work, 'tag', 'v0.0.1-local');

		const outcome = await createStartupGitSeam(runnerFor(work)).fetch({
			integrationBranch: 'develop',
			workRefPrefix: 'delendai/wip/',
		});

		expect(outcome.ok).toBe(true);
		expect(git(work, 'tag', '-l', 'v*').split('\n').sort()).toEqual([
			'v0.0.1-local',
			'v9.9.9',
		]);
	});
});
