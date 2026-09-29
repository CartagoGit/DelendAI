/**
 * A pull request not opened from a publication is closed (x00690).
 */
import { describe, expect, it } from 'vitest';

import { declaredBranches } from '../lib/declared-branches';
import { FORWARD_SYNC_REF_PREFIX } from './forward-sync-release.script';
import { repoRoot } from '../lib/repo-root';

import {
	closingComment,
	unpublishedPullRequests,
} from './close-unpublished-prs.script';

// The project's own declaration, not a copy of its naming.
const BRANCHES = declaredBranches(repoRoot());

describe('unpublishedPullRequests', () => {
	it('closes a pull request from a work ref or outside the namespaces, and keeps publications and forks', () => {
		const toClose = unpublishedPullRequests(
			[
				{
					number: 514,
					headRefName:
						'delendai/wip/minimax-3/review/f00553-review-g1/review',
					isCrossRepository: false,
				},
				{
					number: 520,
					headRefName:
						'delendai/pr/claude-opus-5-5/implement/x00681-all-g1/a-refused-close-says-why-in-the-test',
					isCrossRepository: false,
				},
				{ number: 9, headRefName: 'feature', isCrossRepository: true },
				{
					number: 10,
					headRefName: 'feature',
					isCrossRepository: false,
				},
			],
			BRANCHES,
		);
		expect(toClose.map((pull) => pull.number)).toEqual([514, 10]);
		expect(toClose[0]?.problem).toContain('work ref');
	});

	it('tells the author how to publish, and that the branch was kept', () => {
		const comment = closingComment('`x` is a work ref.');
		expect(comment).toContain('delendai work publish');
		expect(comment).toContain('The branch was left as it is');
	});

	it('keeps the promotion into the release branch and the forward sync back', () => {
		const toClose = unpublishedPullRequests(
			[
				{
					number: 641,
					headRefName: BRANCHES.integration,
					baseRefName: BRANCHES.release,
					isCrossRepository: false,
				},
				{
					number: 642,
					headRefName: `${FORWARD_SYNC_REF_PREFIX}abc123`,
					baseRefName: BRANCHES.integration,
					isCrossRepository: false,
				},
				{
					number: 643,
					headRefName: BRANCHES.integration,
					baseRefName: 'feature',
					isCrossRepository: false,
				},
			],
			BRANCHES,
		);
		expect(toClose.map((pull) => pull.number)).toEqual([643]);
	});
});
