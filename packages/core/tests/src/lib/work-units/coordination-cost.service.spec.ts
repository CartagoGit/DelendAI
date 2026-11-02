/**
 * coordination-cost.service.spec.ts — the share of what landed that only
 * coordinated.
 */
import { describe, expect, it } from 'vitest';

import { coordinationCostOf } from '@delendai/core/lib/work-units/coordination-cost.service';

describe('coordinationCostOf', () => {
	it("counts merges and the tools' bookkeeping against everything that landed", () => {
		const log = [
			'a1 b1\tMerge pull request #1 from x',
			'c1\tfeat(core): the work',
			'd1\tchore(generated): recompute the catalog',
			'e1\tchore(delendai): delendai_proposals_proposal_review x1 S1 approve',
			'f1\tchore(review): claim x00001',
			'g1\tfix(cli): more work',
			'h1\tchore(deps): bump a package',
		].join('\n');
		expect(coordinationCostOf(log, 7)).toEqual({
			windowDays: 7,
			commits: 7,
			merges: 1,
			bookkeeping: 3,
			tax: 0.571,
		});
	});

	it('counts the units that landed and the agents they came from, whatever the forge words a merge', () => {
		const log = [
			'a1 b1\tMerge pull request #7 from owner/work/pr/agent-a/implement/x1-S1-g1/topic',
			"c1 d1\tMerge branch 'work/pr/agent-b/review/batch-g1/verdicts' into 'develop'",
			'e1 f1\tMerge pull request #9 from owner/work/pr/agent-a/implement/x2-S1-g1/other',
			"g1 h1\tMerge remote-tracking branch 'origin/develop' into HEAD",
			'i1\tfeat(core): the work',
		].join('\n');
		expect(coordinationCostOf(log, 7, 'work/pr/').landed).toEqual({
			units: 3,
			agents: 2,
		});
		// A project that publishes no refs has nothing to count.
		expect(coordinationCostOf(log, 7).landed).toBeUndefined();
	});

	it('is zero over a window with nothing in it', () => {
		expect(coordinationCostOf('', 7).tax).toBe(0);
	});
});
