/**
 * carried-work.service.spec.ts — work an agent carried in from another
 * agent's unit keeps its maker. On a real repository.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { carriedFrom } from '../../../../src/lib/services/carried-work.service';
import { createGitRunner } from '../../../../src/lib/shared/git-runner';
import { createReviewRepo, type IReviewRepo } from '../tools/review-repo';

const { branches } = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const MAKER = 'delendai/wip/claude-opus-5-5/implement/x00001-S1-g1/work';
const CARRIER = 'delendai/wip/gpt-6/implement/x00001-S1-g1/work';
const HOUR = 3600;
const now = (): number => Math.floor(Date.now() / 1000);

let repo: IReviewRepo;
beforeEach(() => {
	repo = createReviewRepo();
});
afterEach(() => repo.cleanup());

/** A commit on the maker's unit, made `ago` seconds before now. */
const makerCommits = (ago: number): void => {
	repo.git('switch', '-q', '-c', MAKER, 'develop');
	writeFileSync(join(repo.root, 'src/a.ts'), 'export const a = 1;\n');
	repo.git('add', '-A');
	const date = `@${String(now() - ago)} +0000`;
	execFileSync('git', ['commit', '-q', '--no-verify', '-m', 'feat: a'], {
		cwd: repo.root,
		env: {
			...process.env,
			GIT_COMMITTER_DATE: date,
			GIT_AUTHOR_DATE: date,
		},
	});
};

describe('carriedFrom', () => {
	it('names the maker of work carried into a unit entered after it', async () => {
		makerCommits(2 * HOUR);
		repo.git('switch', '-q', '-c', CARRIER);

		expect(
			await carriedFrom(
				createGitRunner(repo.root),
				branches,
				'develop',
				'gpt-6',
				now() - HOUR,
			),
		).toBe('claude-opus-5-5');
	});

	it('leaves work made in the unit after it was entered to the submitter', async () => {
		makerCommits(2 * HOUR);
		repo.git('switch', '-q', '-c', CARRIER);

		expect(
			await carriedFrom(
				createGitRunner(repo.root),
				branches,
				'develop',
				'gpt-6',
				now() - 3 * HOUR,
			),
		).toBeUndefined();
	});

	it('finds nothing carried when only the submitter holds the work, or its entry is unknown', async () => {
		makerCommits(2 * HOUR);
		const run = createGitRunner(repo.root);
		expect(
			await carriedFrom(
				run,
				branches,
				'develop',
				'claude-opus-5-5',
				now(),
			),
		).toBeUndefined();
		expect(
			await carriedFrom(run, branches, 'develop', 'gpt-6', undefined),
		).toBeUndefined();
	});
});
