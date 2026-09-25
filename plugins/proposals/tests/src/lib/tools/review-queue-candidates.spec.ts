/**
 * review-queue-candidates.spec.ts — where the queue looks for a slice's
 * delivery, and what it says when a slice is not a reviewer's to settle
 * (x00646 S3, S5).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildReviewQueueRegistration } from '@delendai/proposals/lib/tools/review-queue.tool';

import {
	captureHandler,
	createReviewRepo,
	SLICE_S1,
	type IReviewRepo,
} from './review-repo';

let repo: IReviewRepo;

interface ISliceView {
	readonly verdict: string;
	readonly implementer?: string;
	readonly implementerSource?: string;
	readonly candidates: readonly {
		readonly commit: string;
		readonly source: string;
	}[];
	readonly missing?: string;
	readonly nextAction: string;
}

const firstSlice = async (
	overrides: Parameters<IReviewRepo['options']>[0] = {},
): Promise<ISliceView | undefined> => {
	const answer = await (
		await captureHandler(
			buildReviewQueueRegistration(repo.options(overrides)),
		)
	)({});
	const proposals = answer.body.proposals as readonly {
		readonly slices: readonly ISliceView[];
	}[];
	return proposals[0]?.slices[0];
};

/** A commit straight on develop, no work ref anywhere near it. */
const commitOnDevelop = (message: string): string => {
	repo.git('commit', '-q', '--allow-empty', '--no-verify', '-m', message);
	return repo.git('rev-parse', 'HEAD');
};

beforeEach(() => {
	repo = createReviewRepo();
});

afterEach(() => {
	repo.cleanup();
});

describe('review_queue candidates and states', () => {
	it('leaves a slice whose changes were requested to its implementer', async () => {
		repo.proposalInReview(
			`${SLICE_S1('in-progress')}- review-state: changes_requested\n- review-implementer: agent-a\n- review-log: requested_changes by agent-b — broken\n`,
		);

		const slice = await firstSlice();

		expect(slice).toMatchObject({
			verdict: 'waiting-on-implementer',
			implementer: 'agent-a',
			implementerSource: 'round',
		});
	});

	it('takes the commit a slice records, and one that only cites the proposal', async () => {
		const recorded = commitOnDevelop('feat: the slice work');
		commitOnDevelop('fix: a follow-up (x00001)');
		repo.proposalInReview(
			`${SLICE_S1('review')}- shipped-in: \`${recorded}\`\n`,
		);

		const slice = await firstSlice();

		expect(slice?.candidates.map((candidate) => candidate.source)).toEqual([
			'slice shipped-in',
			'fix: a follow-up (x00001) (cites x00001)',
		]);
		expect(slice).toMatchObject({
			verdict: 'needs-verdict',
			implementer: 'unrecorded',
			implementerSource: 'unrecorded',
		});
	});

	it('reports a frontmatter commit that is not in the clone as the missing datum', async () => {
		const path = repo.proposalInReview(SLICE_S1('review'));
		const { readFileSync, writeFileSync } = await import('node:fs');
		writeFileSync(
			path,
			readFileSync(path, 'utf8').replace(
				'type: proposal\n',
				'type: proposal\nshipped-in: [deadbeef1]\n',
			),
		);

		const slice = await firstSlice();

		expect(slice?.candidates[0]).toEqual({
			commit: 'deadbeef1',
			source: 'frontmatter shipped-in',
		});
		expect(slice?.verdict).toBe('blocked');
		expect(slice?.missing).toContain('commit deadbeef1');
		expect(slice?.nextAction).toContain('no commit is needed for that');
	});

	it('works for a project with no development policy', async () => {
		repo.proposalInReview(
			`${SLICE_S1('review')}- review-state: in_review\n- review-implementer: agent-r\n`,
		);

		const slice = await firstSlice({ developmentPolicy: undefined });

		expect(slice).toMatchObject({
			verdict: 'needs-verdict',
			implementer: 'agent-r',
		});
	});
});
