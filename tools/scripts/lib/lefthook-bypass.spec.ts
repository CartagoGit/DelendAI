import { describe, expect, it } from 'vitest';

import { isLefthookBypassed } from './lefthook-bypass';

describe('isLefthookBypassed', () => {
	it('is true when LEFTHOOK_BYPASS=1', () => {
		expect(isLefthookBypassed({ LEFTHOOK_BYPASS: '1' })).toBe(true);
	});

	it('is false when unset', () => {
		expect(isLefthookBypassed({})).toBe(false);
	});

	it('is false for any value other than the literal string "1"', () => {
		expect(isLefthookBypassed({ LEFTHOOK_BYPASS: 'true' })).toBe(false);
		expect(isLefthookBypassed({ LEFTHOOK_BYPASS: 'yes' })).toBe(false);
		expect(isLefthookBypassed({ LEFTHOOK_BYPASS: '0' })).toBe(false);
	});
});
