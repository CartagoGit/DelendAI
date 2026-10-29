import { describe, expect, it } from 'vitest';

import { localeOrderLines } from './no-locale-order-in-canonical.script';

describe('no-locale-order-in-canonical', () => {
	it('names each localeCompare call, and not one in a comment', () => {
		expect(
			localeOrderLines(
				'a.ts',
				[
					'x.sort((a, b) => a.localeCompare(b));',
					'// a.localeCompare(b)',
					' * a.localeCompare(b)',
				].join('\n'),
			),
		).toEqual(['a.ts:1']);
	});
});
