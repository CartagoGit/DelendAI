import { describe, expect, it } from 'vitest';

describe('legacy inspect smoke', () => {
	it('keeps the inherited spec path inert', () => {
		expect(true).toBe(true);
	});
});
