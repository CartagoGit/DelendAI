/**
 * pack-governance.service.spec.ts — a pack's refusals are its own
 * approvals' and claims', one sentence each.
 */
import { describe, expect, it } from 'vitest';

import { packRefusals } from '@delendai/proposals/lib/services/pack-governance.service';

const approval = (by: string): string =>
	`+- review-log: approved by ${by} — verified at abc, validate exit 0`;

describe('packRefusals', () => {
	it('lets a pack of its author’s own claimed verdicts land', () => {
		expect(
			packRefusals({
				author: 'minimax-m3.1',
				diff: approval('MiniMax-M3.1'),
				changedPaths: ['docs/delendai/proposals/review/x00002-a.md'],
				claimed: ['X00002'],
			}),
		).toEqual([]);
	});

	it('names the approvals of another reviewer, and the proposals it never claimed', () => {
		const refusals = packRefusals({
			author: 'claude-opus-5-5',
			diff: [approval('GPT-5.4'), approval('GPT-5.4')].join('\n'),
			changedPaths: [
				'docs/delendai/proposals/review/x00002-a.md',
				'docs/delendai/proposals/done/fixes/f00267-b.md',
			],
			claimed: ['x00002'],
		});
		expect(refusals).toHaveLength(2);
		expect(refusals[0]).toContain('approvals by GPT-5.4,');
		expect(refusals[1]).toContain(
			'changes f00267 without having claimed it',
		);
	});
});
