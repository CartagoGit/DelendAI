import { describe, expect, it } from 'vitest';

import { trapTarget } from './_focus-trap';

describe('trapTarget', () => {
	const items = ['a', 'b', 'c'];
	it('wraps forward from the last element', () => {
		expect(trapTarget(items, 'c', false)).toBe('a');
	});
	it('wraps backward from the first element', () => {
		expect(trapTarget(items, 'a', true)).toBe('c');
	});
	it('lets the browser move inside the dialog', () => {
		expect(trapTarget(items, 'b', false)).toBeNull();
		expect(trapTarget(items, 'b', true)).toBeNull();
	});
	it('pulls focus in when it sits outside the dialog', () => {
		expect(trapTarget(items, null, false)).toBe('a');
		expect(trapTarget(items, 'x', true)).toBe('c');
	});
	it('does nothing for an empty dialog', () => {
		expect(trapTarget([], null, false)).toBeNull();
	});
});
