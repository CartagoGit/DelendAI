/**
 * integration-remote.spec.ts — one remote, resolved once.
 *
 * The fetch phase took whatever `git remote` listed first while every
 * currency check looked up `refs/remotes/origin/…`. A project whose
 * remote is called `upstream` therefore fetched from one repository and
 * judged itself against another — and was told its integration branch
 * did not exist anywhere. Driven against real git, because the claim is
 * about what git reports for a clone whose remote is not `origin`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createStartupGitSeam } from '@delendai/core/lib/startup-reconciler/git-seam';
import { runCheckoutPhase } from '@delendai/core/lib/startup-reconciler/phases/verify-checkout';
import type {
	IGitRunner,
	IGitRunResult,
} from '@delendai/core/lib/contracts/interfaces/git-runner.interface';

import { testPolicy } from './fakes';

const roots: string[] = [];
const INTEGRATION = 'develop';

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

/** A clone whose only remote carries `name`, never `origin`. */
const cloneWithRemote = (name: string): string => {
	const root = mkdtempSync(join(tmpdir(), 'integration-remote-'));
	roots.push(root);
	const originDir = join(root, 'origin.git');
	const seed = join(root, 'seed');
	const work = join(root, 'work');
	execFileSync('mkdir', ['-p', originDir, seed]);
	git(originDir, 'init', '-q', '--bare', '--initial-branch', INTEGRATION);
	git(seed, 'init', '-q', '--initial-branch', INTEGRATION);
	git(seed, 'config', 'user.email', 'remote@example.com');
	git(seed, 'config', 'user.name', 'Remote');
	git(seed, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(seed, 'a.ts'), 'export const a = 1;\n');
	git(seed, 'add', '-A');
	git(seed, 'commit', '-q', '--no-verify', '-m', 'base');
	git(seed, 'remote', 'add', 'origin', originDir);
	git(seed, 'push', '-q', 'origin', INTEGRATION);
	git(root, 'clone', '-q', '--origin', name, originDir, work);
	git(work, 'config', 'user.email', 'remote@example.com');
	git(work, 'config', 'user.name', 'Remote');
	git(work, 'config', 'commit.gpgsign', 'false');
	return work;
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('the integration remote (x00558 S3)', () => {
	it('resolves what the integration branch actually tracks', async () => {
		const work = cloneWithRemote('upstream');
		const seam = createStartupGitSeam(runnerFor(work));
		expect(await seam.integrationRemote?.(INTEGRATION)).toBe('upstream');
	});

	it('does not report the integration branch as missing on an upstream-only clone', async () => {
		const work = cloneWithRemote('upstream');
		const result = await runCheckoutPhase({
			git: createStartupGitSeam(runnerFor(work)),
			policy: testPolicy(),
			refs: [],
		});
		const codes = result.findings.map((finding) => finding.code);
		expect(codes).not.toContain('checkout.integration-missing');
		expect(codes).toContain('checkout.on-integration');
	});

	it('prefers origin when the branch tracks nothing and both exist', async () => {
		const work = cloneWithRemote('upstream');
		git(
			work,
			'remote',
			'add',
			'origin',
			git(work, 'remote', 'get-url', 'upstream'),
		);
		git(work, 'config', '--unset', `branch.${INTEGRATION}.remote`);
		const seam = createStartupGitSeam(runnerFor(work));
		expect(await seam.integrationRemote?.(INTEGRATION)).toBe('origin');
	});

	it('falls back to the only remote there is', async () => {
		const work = cloneWithRemote('upstream');
		git(work, 'config', '--unset', `branch.${INTEGRATION}.remote`);
		const seam = createStartupGitSeam(runnerFor(work));
		expect(await seam.integrationRemote?.(INTEGRATION)).toBe('upstream');
	});

	it('answers nothing for a repository with no remote at all', async () => {
		const root = mkdtempSync(join(tmpdir(), 'no-remote-'));
		roots.push(root);
		git(root, 'init', '-q', '--initial-branch', INTEGRATION);
		const seam = createStartupGitSeam(runnerFor(root));
		expect(await seam.integrationRemote?.(INTEGRATION)).toBeUndefined();
	});
});
