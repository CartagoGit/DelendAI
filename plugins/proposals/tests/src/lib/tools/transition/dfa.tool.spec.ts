/**
 * dfa.tool.spec.ts — a refusal that the proposal already stands in review
 * carries a code, so callers never read its wording.
 */
import { describe, expect, it } from 'vitest';

import { validateTransition } from '@delendai/proposals/lib/tools/transition/dfa.tool';

const refusal = (from: 'review' | 'ready', to: 'review') => {
	const result = validateTransition('x00001', from, to);
	expect(result).not.toBeNull();
	return result?.structuredContent as {
		code?: string;
		error: { code?: string; reason: string };
	};
};

describe('validateTransition refusal code', () => {
	it('[<20ms] carries already-in-review on review to review', () => {
		const out = refusal('review', 'review');
		expect(out.code).toBe('already-in-review');
		expect(out.error.code).toBe('already-in-review');
	});

	it('[<20ms] carries no code on another illegal transition', () => {
		const out = refusal('ready', 'review');
		expect(out.code).toBeUndefined();
		expect(out.error.code).toBeUndefined();
	});
});
