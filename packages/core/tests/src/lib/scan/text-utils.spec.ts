import { describe, expect, it } from 'vitest';

import { fnv1a, lineOf } from '../../../../src/lib/scan/text-utils';

describe('scan/text-utils — lineOf', () => {
	it('returns 1 for an index on the first line', () => {
		expect(lineOf('hello', 0)).toBe(1);
	});

	it('counts LF characters to compute the 1-based line', () => {
		const body = 'a\nb\nc\nd';
		expect(lineOf(body, 0)).toBe(1);
		expect(lineOf(body, 2)).toBe(2);
		expect(lineOf(body, 4)).toBe(3);
		expect(lineOf(body, 6)).toBe(4);
	});

	it('returns 1 when charIndex is 0 on an empty body', () => {
		expect(lineOf('', 0)).toBe(1);
	});

	it('returns the correct line for a multi-line body', () => {
		const body = 'line1\nline2\nline3\nline4';
		expect(lineOf(body, body.length - 1)).toBe(4);
	});
});

describe('scan/text-utils — fnv1a', () => {
	it('returns the FNV-1a offset basis for the empty string', () => {
		expect(fnv1a('')).toBe('811c9dc5');
	});

	it('produces 8 hex chars', () => {
		expect(fnv1a('hello')).toMatch(/^[0-9a-f]{8}$/);
	});

	it('is deterministic for the same input', () => {
		expect(fnv1a('hello world')).toBe(fnv1a('hello world'));
	});

	it('produces different hashes for different inputs', () => {
		expect(fnv1a('a')).not.toBe(fnv1a('b'));
	});
});
