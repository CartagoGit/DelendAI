/**
 * string-helpers.spec.ts
 *
 * Pins the contract of `shared/string-helpers.ts` — the pure
 * string transformations used across the proposals plugin.
 *
 * Coverage:
 *   - `escapeRegExp`: every regex metacharacter escapes correctly,
 *     and non-metacharacters pass through untouched.
 *   - `kebab`: lowercase, runs of non-alphanumerics collapse to
 *     single `-`, leading/trailing dashes trimmed, empty input
 *     returns empty.
 *
 * These helpers are tiny but security-adjacent: a bad escapeRegExp
 * lets a user-supplied slice id break the regex it is interpolated
 * into. The spec guards against regression in either direction
 * (over-escape breaks IDs, under-escape is a vuln).
 */

import { describe, expect, it } from 'vitest';

import {
	escapeRegExp,
	kebab,
} from '@mcp-vertex/proposals/lib/shared/string-helpers';

describe('escapeRegExp', () => {
	it('escapes every regex metacharacter', () => {
		// Build a single string containing all 14 metacharacters and
		// assert none of them retains its regex meaning after escape.
		const input = `.*+?^\${}()|[]\\`;
		const out = escapeRegExp(input);
		// The escaped string must NOT match the unescaped input as a
		// regex (every metacharacter is neutralised).
		expect(() => new RegExp(out)).not.toThrow();
		// The escaped string IS the literal characters, just with
		// backslashes prepended where needed.
		expect(out).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
	});

	it('passes through plain alphanumeric input untouched', () => {
		expect(escapeRegExp('hello-world_42')).toBe('hello-world_42');
	});

	it('escapes a single character at a time', () => {
		expect(escapeRegExp('.')).toBe('\\.');
		expect(escapeRegExp('?')).toBe('\\?');
		expect(escapeRegExp('\\')).toBe('\\\\');
	});

	it('produces a regex that only matches the literal input', () => {
		// Real-world example: a slice id like "S.1" should match itself,
		// not "S_anything_1".
		const sliceId = 'S.1*';
		const re = new RegExp(`^${escapeRegExp(sliceId)}$`);
		expect(re.test(sliceId)).toBe(true);
		expect(re.test('S_1_anything')).toBe(false);
	});
});

describe('kebab', () => {
	it('lowercases and dashes non-alphanumerics', () => {
		expect(kebab('Hello World')).toBe('hello-world');
	});

	it('collapses runs of non-alphanumerics into a single dash', () => {
		expect(kebab('foo   bar___baz')).toBe('foo-bar-baz');
	});

	it('trims leading and trailing dashes', () => {
		expect(kebab('---already---kebab')).toBe('already-kebab');
		expect(kebab('///leading-and-trailing///')).toBe(
			'leading-and-trailing',
		);
	});

	it('handles punctuation correctly', () => {
		expect(kebab('My Cool Slice!')).toBe('my-cool-slice');
		expect(kebab('foo/bar baz')).toBe('foo-bar-baz');
		expect(kebab('v1.2.3-rc.1')).toBe('v1-2-3-rc-1');
	});

	it('returns empty string for whitespace-only input', () => {
		expect(kebab('   ')).toBe('');
		expect(kebab('')).toBe('');
	});

	it('preserves digits as-is', () => {
		expect(kebab('S1 S2 S3')).toBe('s1-s2-s3');
		expect(kebab('42')).toBe('42');
	});
});
