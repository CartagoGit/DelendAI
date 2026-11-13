/**
 * review-claim-timeout.e2e.spec.ts — a claim commit can be reported failed and
 * still land: under load the runner's timeout fires while git is finishing.
 * What the unit carries decides what the reviewer is told.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { claimForReview } from '@delendai/proposals/lib/services/review-claim.service';
import {
	createGitRunner,
	type IGitRunner,
} from '@delendai/proposals/lib/shared/git-runner';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

/** A review unit one commit ahead of nothing: develop is its base. */
const unit = () => {
	const root = mkdtempSync(join(tmpdir(), 'claim-timeout-'));
	roots.push(root);
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
	git('init', '-q', '-b', 'develop');
	git('config', 'user.email', 'r@example.com');
	git('config', 'user.name', 'R');
	git('config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'README.md'), '# project\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'base');
	git(
		'switch',
		'-q',
		'-c',
		'delendai/wip/agent-a/review/batch-all-g1/verdicts',
	);
	return { root, git, run: createGitRunner(root) };
};

const TIMED_OUT = {
	ok: false,
	output: '',
	reason: 'git timed out after 15000ms',
};

describe('claimForReview when git times out', () => {
	it('[<253ms] reports the claim held when the commit landed after all', async () => {
		const { git, run } = unit();
		const late: IGitRunner = async (args) => {
			const result = await run(args);
			return args[0] === 'commit' && result.ok ? TIMED_OUT : result;
		};
		const outcome = await claimForReview(
			late,
			undefined,
			'x00001',
			'develop',
		);
		expect(outcome.kind).toBe('claimed');
		expect(
			git('log', '-1', '--format=%(trailers:key=Claims,valueonly)'),
		).toBe('x00001');
	});

	it('[<150ms] reports the failure when no claim landed', async () => {
		const { run } = unit();
		const refused: IGitRunner = async (args) =>
			args[0] === 'commit' ? TIMED_OUT : run(args);
		expect(
			await claimForReview(refused, undefined, 'x00001', 'develop'),
		).toEqual({ kind: 'failed', reason: 'git timed out after 15000ms' });
	});
});
