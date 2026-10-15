/**
 * review-state.service.spec.ts — a proposal in review a reviewer holds is
 * in-review; one nobody holds waits. On a real repository.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import {
	reviewersAtWork,
	reviewStateOf,
} from '../../../../src/lib/services/review-state.service';
import { createReviewRepo, type IReviewRepo } from '../tools/review-repo';

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

let repo: IReviewRepo;
const dirs: string[] = [];
beforeEach(() => {
	repo = createReviewRepo();
});
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
	repo.cleanup();
});

/** A reviewer's unit in its own worktree, its claim committed just now. */
const reviewerClaims = (agent: string, proposal: string): string => {
	const parent = realpathSync(mkdtempSync(join(tmpdir(), 'reviewer-')));
	dirs.push(parent);
	const path = join(parent, 'wt');
	repo.git(
		'worktree',
		'add',
		'-q',
		'-b',
		`delendai/wip/${agent}/review/batch-all-g1/verdicts`,
		path,
		'develop',
	);
	execFileSync(
		'git',
		[
			'commit',
			'--allow-empty',
			'-q',
			'--no-verify',
			'-m',
			`chore(review): claim ${proposal}`,
			'--trailer',
			`Claims: ${proposal}`,
		],
		{ cwd: path },
	);
	return path;
};

describe('the review state of a proposal', () => {
	it('is in-review while a reviewer holds it, and review otherwise', async () => {
		reviewerClaims('gpt-5.4', 'x00001');
		const atWork = await reviewersAtWork(repo.root, policy);

		expect(atWork.get('x00001')).toEqual(['gpt-5.4']);
		expect(reviewStateOf('X00001', atWork)).toBe('in-review');
		expect(reviewStateOf('x00002', atWork)).toBe('review');
	});

	it('is review when nobody has claimed anything', async () => {
		expect((await reviewersAtWork(repo.root, policy)).size).toBe(0);
	});

	it('is review again once its reviewer gives the claim back', async () => {
		const unit = reviewerClaims('gpt-5.4', 'x00001');
		execFileSync(
			'git',
			[
				'commit',
				'--allow-empty',
				'-q',
				'--no-verify',
				'-m',
				'chore(review): release x00001',
				'--trailer',
				'Releases: x00001',
			],
			{ cwd: unit },
		);
		const atWork = await reviewersAtWork(repo.root, policy);
		expect(reviewStateOf('x00001', atWork)).toBe('review');
	});
});
