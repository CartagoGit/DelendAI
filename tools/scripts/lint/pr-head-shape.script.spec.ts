/**
 * A pull request is opened from a well-shaped publication ref (f00644).
 */
import { describe, expect, it } from 'vitest';

import { prHeadProblem } from './pr-head-shape.script';

const BRANCHES = {
	workRefTemplate:
		'heads/delendai/wip/${agent}/${kind}/${proposal}-${slice}-g${generation}/${topic}',
	workRefPrefix: 'heads/delendai/wip/',
	publicationRefPrefix: 'heads/delendai/pr/',
};

describe('prHeadProblem', () => {
	it('accepts a publication of the shape, and one written before the kind', () => {
		expect(
			prHeadProblem(
				'delendai/pr/claude-opus-5-5/review/x00001-all-g1/batch',
				BRANCHES,
			),
		).toBeUndefined();
		expect(
			prHeadProblem(
				'delendai/pr/claude-opus-5-5/x00001-S1-g1/t',
				BRANCHES,
			),
		).toBeUndefined();
	});

	it('refuses a pull request opened from a work ref', () => {
		expect(
			prHeadProblem(
				'delendai/wip/minimax-m3/review/x00558-all-g1/review',
				BRANCHES,
			),
		).toContain('is a work ref');
	});

	it('refuses an agent named after the program it runs in (x00694)', () => {
		expect(
			prHeadProblem(
				'delendai/pr/copilot/review/batch-all-g1/close-the-ready-review-batches',
				BRANCHES,
			),
		).toContain('the program the agent runs in');
	});

	it('refuses an agent that spells the kind of work', () => {
		expect(
			prHeadProblem(
				'delendai/pr/minimax-m3-review-20260926/x00558-review-g1/review',
				BRANCHES,
			),
		).toContain('spells the kind of work');
	});

	it('refuses a name with no shape at all', () => {
		expect(
			prHeadProblem('delendai/pr/proposal-f00643', BRANCHES),
		).toContain('does not have the shape');
		expect(prHeadProblem('feature/whatever', BRANCHES)).toContain(
			'outside',
		);
	});
});
