import { describe, expect, it } from 'vitest';

import { divergedReviewPacks } from '../../../../src/lib/work-units/diverged-review-pack.service';

const PACK = 'delendai/pr/gpt-5.3-codex/review/batch-all-g1/verdicts';
const WIP = 'delendai/wip/gpt-5.3-codex/implement/batch-all-g1/work';

describe('divergedReviewPacks', () => {
	it('reports a pack holding commits its wip lacks, with the merge to run', () => {
		const refs = new Map([
			[PACK, 'pack'],
			[WIP, 'wip'],
		]);
		expect(divergedReviewPacks({ refs, isAncestor: () => false })).toEqual([
			{ pack: PACK, wip: WIP, merge: `git merge ${PACK}` },
		]);
	});

	it('is silent when the wip holds the pack, or no wip names the unit', () => {
		const held = new Map([
			[PACK, 'pack'],
			[WIP, 'wip'],
		]);
		expect(
			divergedReviewPacks({ refs: held, isAncestor: () => true }),
		).toEqual([]);
		expect(
			divergedReviewPacks({
				refs: new Map([[PACK, 'pack']]),
				isAncestor: () => false,
			}),
		).toEqual([]);
	});

	it('ignores another agent and a pack that is not a review', () => {
		const refs = new Map([
			[PACK, 'pack'],
			['delendai/wip/other-model/review/batch-all-g1/verdicts', 'o'],
			['delendai/pr/a/implement/x00001-S1-g1/t', 'p'],
			['delendai/wip/a/implement/x00001-S1-g1/t', 'w'],
		]);
		expect(divergedReviewPacks({ refs, isAncestor: () => false })).toEqual(
			[],
		);
	});
});
