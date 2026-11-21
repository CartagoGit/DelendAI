/**
 * proposal-review-carried.spec.ts — a slice handed in by an agent that
 * carried another agent's work names the agent that made it. On a real
 * repository.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { recordUnitEntered } from '@delendai/core/lib/work-units/unit-lease.service';

import { createReviewRepo, SLICE_S1, type IReviewRepo } from './review-repo';

const MAKER = 'delendai/wip/claude-opus-5-5/implement/x00001-S1-g1/work';
const CARRIER = 'delendai/wip/gpt-6/implement/x00001-S1-g1/work';
const now = (): number => Math.floor(Date.now() / 1000);

let repo: IReviewRepo;
beforeEach(() => {
	repo = createReviewRepo();
});
afterEach(() => repo.cleanup());

describe('a submission of carried work', () => {
	it('records the agent that made it as the implementer, and who carried it', async () => {
		repo.proposalInReview(SLICE_S1('in-progress'));
		repo.git('switch', '-q', '-c', MAKER);
		writeFileSync(join(repo.root, 'src/a.ts'), 'export const a = 1;\n');
		repo.git('add', '-A');
		const date = `@${String(now() - 7200)} +0000`;
		execFileSync('git', ['commit', '-q', '--no-verify', '-m', 'feat: a'], {
			cwd: repo.root,
			env: {
				...process.env,
				GIT_COMMITTER_DATE: date,
				GIT_AUTHOR_DATE: date,
			},
		});
		repo.git('switch', '-q', '-c', CARRIER);
		await recordUnitEntered({
			cwd: repo.root,
			ref: CARRIER,
			owner: { agent: 'gpt-6', session: 's1' },
			worktree: repo.root,
			now: now() - 3600,
		});

		const submitted = await repo.review({
			action: 'submit',
			agent: 'gpt-6',
			note: 'handed in',
		});

		expect(submitted.isError).toBe(false);
		expect(submitted.body).toMatchObject({
			implementer: 'claude-opus-5-5',
		});
		expect(JSON.stringify(submitted.body.rounds)).toContain(
			'carried for claude-opus-5-5',
		);
	});
});
