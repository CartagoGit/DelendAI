import { describe, expect, it } from 'vitest';

import { joinRel } from '../../../../src/lib/shared/paths';

describe('shared/paths — joinRel', () => {
	it('collapses trailing slashes while preserving the joined child', () => {
		expect(joinRel('cache/root///', 'child/file.json')).toBe(
			'cache/root/child/file.json',
		);
	});

	it('returns the child unchanged when the base is empty', () => {
		expect(joinRel('', 'child/file.json')).toBe('child/file.json');
	});

	it('handles a long trailing slash run without pathological slowdown', () => {
		const started = Date.now();
		expect(joinRel(`cache/root${'/'.repeat(40_000)}`, 'child')).toBe(
			'cache/root/child',
		);
		expect(Date.now() - started).toBeLessThan(500);
	});
});
