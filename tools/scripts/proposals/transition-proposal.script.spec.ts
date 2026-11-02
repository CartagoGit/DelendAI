import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	buildTransitionOptions,
	parseTransitionArgs,
} from './transition-proposal.script';

describe('parseTransitionArgs', () => {
	it('takes id, target and a free-form reason', () => {
		expect(
			parseTransitionArgs(['f00201', 'done', 'all', 'slices', 'done']),
		).toEqual({
			id: 'f00201',
			to: 'done',
			reason: 'all slices done',
		});
	});

	it('supplies a reason when none is given, because the tool requires one', () => {
		expect(parseTransitionArgs(['f00201', 'review'])?.reason).not.toBe('');
	});

	it('rejects a missing or blank id/target instead of guessing', () => {
		expect(parseTransitionArgs([])).toBeNull();
		expect(parseTransitionArgs(['f00201'])).toBeNull();
		expect(parseTransitionArgs(['   ', 'done'])).toBeNull();
		expect(parseTransitionArgs(['f00201', '  '])).toBeNull();
	});
});

describe('buildTransitionOptions', () => {
	const options = buildTransitionOptions('/repo');

	it('resolves every path against the given workspace root', () => {
		expect(options.proposalsDirAbs).toBe(
			resolve('/repo', 'docs/delendai/proposals'),
		);
		expect(options.indexPathAbs).toBe(
			resolve('/repo', '.cache/delendai/proposals/index.json'),
		);
		expect(options.peerReviewLogPathAbs).toBe(
			resolve('/repo', '.cache/delendai/proposals/peer-review.jsonl'),
		);
	});

	it('keeps every gate on — this CLI is the same door, not a bypass', () => {
		expect(options.requirePeerReview).toBe(true);
		expect(options.requireValidateEvidence).toBe(true);
	});
});
