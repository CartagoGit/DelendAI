/**
 * review-queue-drift.spec.ts — the review queue says how far the repository
 * moved under each proposal since its work landed, and lists the reviews
 * that grew dearest first (f00640 S2). On a real repository.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildReviewQueueRegistration } from '@delendai/proposals/lib/tools/review-queue.tool';

import {
	captureHandler,
	createReviewRepo,
	type IReviewRepo,
} from './review-repo';

let repo: IReviewRepo;

beforeEach(() => {
	repo = createReviewRepo();
});

afterEach(() => {
	repo.cleanup();
});

const slice = (file: string): string => `### S1 — the work
- **Status**: review
- **Files**: \`${file}\`
`;

interface IDriftView {
	readonly id: string;
	readonly drift?: {
		readonly measured: boolean;
		readonly commitsSince?: number;
		readonly filesTouchedSince?: readonly string[];
		readonly driftRatio?: number;
	};
}

describe('the review queue orders by drift', () => {
	it('lists first the review whose files were rewritten after it landed', async () => {
		repo.deliverThroughPullRequest(
			'src/a.ts',
			'delendai/pr/agent-a/x00001-S1-g1/first',
		);
		repo.deliverThroughPullRequest(
			'src/b.ts',
			'delendai/pr/agent-a/x00002-S1-g1/second',
		);
		// x00001's file is rewritten after it landed; x00002's is not.
		writeFileSync(join(repo.root, 'src/a.ts'), 'export const a = 2;\n');
		repo.git('add', 'src/a.ts');
		repo.git('commit', '-q', '--no-verify', '-m', 'refactor: rewrite a');
		// x00002 is the older proposal: without drift it would come first.
		repo.proposalInReview(slice('src/b.ts'), 'x00002', '2026-09-01');
		repo.proposalInReview(slice('src/a.ts'), 'x00001', '2026-09-02');

		const answer = await (
			await captureHandler(buildReviewQueueRegistration(repo.options()))
		)({ agent: 'agent-b' });
		const proposals = answer.body.proposals as readonly IDriftView[];

		expect(proposals.map((proposal) => proposal.id)).toEqual([
			'x00001',
			'x00002',
		]);
		expect(proposals[0]?.drift).toMatchObject({
			measured: true,
			filesTouchedSince: ['src/a.ts'],
			driftRatio: 1,
		});
		expect(proposals[1]?.drift).toMatchObject({
			measured: true,
			filesTouchedSince: [],
			driftRatio: 0,
		});
	});
});
