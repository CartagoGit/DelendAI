import { describe, expect, it } from 'vitest';

import {
	everySliceHandedOver,
	verdictGatePolicy,
} from '@delendai/proposals/lib/tools/review-verdict-lifecycle';

const doc = (...statuses: string[]): string =>
	`---\nid: x00001\nstatus: in-progress\n---\n\n## slices\n\n${statuses
		.map(
			(status, index) =>
				`### S${String(index + 1)} — work\n- **Status**: ${status}\n`,
		)
		.join('\n')}\n## acceptance\n\n- it works\n`;

describe('everySliceHandedOver', () => {
	it('is true once every slice is in review, done or retired', () => {
		expect(everySliceHandedOver(doc('review', 'done', 'retired'))).toBe(
			true,
		);
	});

	it('is false while a slice is still to do, and for a document with no slices', () => {
		expect(everySliceHandedOver(doc('review', 'in-progress'))).toBe(false);
		expect(everySliceHandedOver(doc('pending'))).toBe(false);
		expect(everySliceHandedOver('# nothing\n')).toBe(false);
	});
});

describe('verdictGatePolicy', () => {
	it('carries what makes a reviewer independent into the close', () => {
		expect(
			verdictGatePolicy({
				peerReviewLogPathAbs: '/repo/peer-review.jsonl',
				requirePeerReview: true,
				reviewIndependence: 'instance',
				requireValidateEvidence: false,
				folderPolicy: undefined,
				validateEvidenceDeps: undefined,
			}),
		).toEqual({
			peerReviewLogPathAbs: '/repo/peer-review.jsonl',
			requirePeerReview: true,
			reviewIndependence: 'instance',
			requireValidateEvidence: false,
		});
	});

	it('leaves a setting the project never made to the transition default', () => {
		const policy = verdictGatePolicy({
			peerReviewLogPathAbs: undefined,
			requirePeerReview: undefined,
			reviewIndependence: undefined,
			requireValidateEvidence: undefined,
			folderPolicy: undefined,
			validateEvidenceDeps: undefined,
		});
		expect(policy).toEqual({});
		expect('reviewIndependence' in policy).toBe(false);
	});
});
