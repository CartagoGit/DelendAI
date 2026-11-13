import { describe, expect, it } from 'vitest';

import { missingScanRoots, refuseMissingScanRoots } from './scan-roots.lib';

const HERE = new URL('.', import.meta.url).pathname;

describe('scan roots', () => {
	it('names the roots that are not there', () => {
		expect(missingScanRoots(HERE, ['.', 'not-a-folder'])).toEqual([
			'not-a-folder',
		]);
	});

	it('refuses, and only when a root is missing', () => {
		expect(refuseMissingScanRoots('a-lint', HERE, ['.'])).toBe(false);
		expect(refuseMissingScanRoots('a-lint', HERE, ['not-a-folder'])).toBe(
			true,
		);
	});
});
