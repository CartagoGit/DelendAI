/**
 * review-call.spec.ts — what the review queue tells a reviewer to run,
 * and the approval it asks for.
 */
import { describe, expect, it } from 'vitest';

import { reviewCall } from '@delendai/proposals/lib/services/review-queue-slice.service';

describe('reviewCall', () => {
	it("names the slice's own specs and says the whole suite already ran", () => {
		const call = reviewCall(
			'delendai',
			'x00901',
			'S2',
			'claude-opus-5-5',
			'abc1234',
			[
				'plugins/proposals/src/lib/services/review-verdict-evidence.ts',
				'plugins/proposals/tests/src/lib/tools/review-verdict-evidence.spec.ts',
			],
		);
		expect(call).toContain(
			"run the slice gate and the slice's own specs (plugins/proposals/tests/src/lib/tools/review-verdict-evidence.spec.ts), not the whole suite: CI ran it on abc1234",
		);
		expect(call).toContain(
			'acceptanceCriteria: [{ criterion: "<each acceptance item>"',
		);
		expect(call).toContain('agent: "<you — not claude-opus-5-5>"');
		expect(call).toContain(
			"A failing check the slice did not touch is not the slice's: give the claim back (delendai_review_claim { release:",
		);
	});

	it('still bounds the checks when the slice ships no spec', () => {
		const call = reviewCall(
			'delendai',
			'x00901',
			'S3',
			undefined,
			undefined,
			['delendai.config.json'],
		);
		expect(call).toContain(
			'run the slice gate, not the whole suite: CI ran it on <delivering commit>',
		);
		expect(call).toContain('agent: "<you>"');
	});
});
