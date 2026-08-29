import { describe, expect, it } from 'vitest';

import { asArray } from '@mcp-vertex/test-kit/public';

describe('asArray', () => {
	it('returns the array unchanged when the value really is an array', () => {
		const value: unknown = [1, 2, 3];
		expect(asArray<number>(value)).toEqual([1, 2, 3]);
	});

	it('throws a clear error instead of silently narrowing a non-array', () => {
		const value: unknown = { not: 'an array' };
		expect(() => asArray<number>(value)).toThrow(/expected an array/);
	});

	it('throws for undefined/null instead of silently narrowing', () => {
		expect(() => asArray(undefined)).toThrow(/expected an array/);
		expect(() => asArray(null)).toThrow(/expected an array/);
	});
});
