/**
 * review-restore.service.spec.ts — the proposals forced out of review
 * after a verdict are found from their documents alone.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	findReviewRestoreCandidates,
	restoreCandidateOf,
} from '@delendai/proposals/lib/services/review-restore.service';

const doc = (status: string, slices: string): string =>
	`---\nid: x00001\nstatus: ${status}\nlast-transition-from: review\n---\n\n# x00001\n\n${slices}`;

const SENT_BACK =
	'### S1 — work\n- **Status**: pending\n- review-state: changes_requested\n- review-implementer: agent-a\n- review-reviewer: agent-b\n- review-log: requested_changes by agent-b — fix it\n\n' +
	'### S2 — done\n- **Status**: done\n- review-state: done\n- review-log: approved by agent-c — ok\n';

describe('restoreCandidateOf', () => {
	it('names a proposal in progress whose slices were all handed in and sent back', () => {
		expect(
			restoreCandidateOf(
				'in-progress/x00001-a.md',
				doc('in-progress', SENT_BACK),
			),
		).toEqual({
			id: 'x00001',
			file: 'in-progress/x00001-a.md',
			from: 'in-progress',
			slices: [
				{ sliceId: 'S1', reviewState: 'changes_requested' },
				{ sliceId: 'S2', reviewState: 'done' },
			],
			reviewers: ['agent-b'],
		});
	});

	it('names one still waiting for its verdict too', () => {
		expect(
			restoreCandidateOf(
				'in-progress/x00001-a.md',
				doc(
					'in-progress',
					'### S1 — work\n- **Status**: review\n- review-state: in_review\n- review-implementer: agent-a\n',
				),
			)?.slices,
		).toEqual([{ sliceId: 'S1', reviewState: 'in_review' }]);
	});

	it('leaves alone one taken up again, one with a slice never handed in, and one in review', () => {
		expect(
			restoreCandidateOf(
				'f',
				doc(
					'in-progress',
					SENT_BACK.replace(
						'**Status**: pending',
						'**Status**: in-progress',
					),
				),
			),
		).toBeUndefined();
		expect(
			restoreCandidateOf(
				'f',
				doc(
					'in-progress',
					`${SENT_BACK}\n### S3 — new\n- **Status**: pending\n`,
				),
			),
		).toBeUndefined();
		expect(
			restoreCandidateOf('f', doc('review', SENT_BACK)),
		).toBeUndefined();
	});
});

describe('findReviewRestoreCandidates', () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'review-restore-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('reads in-progress/ only', async () => {
		for (const folder of ['in-progress', 'ready']) {
			mkdirSync(join(root, folder), { recursive: true });
			writeFileSync(
				join(root, folder, 'x00001-a.md'),
				doc(folder, SENT_BACK),
			);
		}
		expect(
			(await findReviewRestoreCandidates(root)).map(
				(found) => found.file,
			),
		).toEqual(['in-progress/x00001-a.md']);
	});
});
