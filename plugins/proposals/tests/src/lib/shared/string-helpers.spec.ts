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
	slugFromTitle,
} from '@delendai/proposals/lib/shared/string-helpers';

describe('escapeRegExp', async () => {
	it('escapes every regex metacharacter', async () => {
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

	it('passes through plain alphanumeric input untouched', async () => {
		expect(escapeRegExp('hello-world_42')).toBe('hello-world_42');
	});

	it('escapes a single character at a time', async () => {
		expect(escapeRegExp('.')).toBe('\\.');
		expect(escapeRegExp('?')).toBe('\\?');
		expect(escapeRegExp('\\')).toBe('\\\\');
	});

	it('produces a regex that only matches the literal input', async () => {
		// Real-world example: a slice id like "S.1" should match itself,
		// not "S_anything_1".
		const sliceId = 'S.1*';
		const re = new RegExp(`^${escapeRegExp(sliceId)}$`);
		expect(re.test(sliceId)).toBe(true);
		expect(re.test('S_1_anything')).toBe(false);
	});
});

describe('kebab', async () => {
	it('lowercases and dashes non-alphanumerics', async () => {
		expect(kebab('Hello World')).toBe('hello-world');
	});

	it('collapses runs of non-alphanumerics into a single dash', async () => {
		expect(kebab('foo   bar___baz')).toBe('foo-bar-baz');
	});

	it('trims leading and trailing dashes', async () => {
		expect(kebab('---already---kebab')).toBe('already-kebab');
		expect(kebab('///leading-and-trailing///')).toBe(
			'leading-and-trailing',
		);
	});

	it('handles punctuation correctly', async () => {
		expect(kebab('My Cool Slice!')).toBe('my-cool-slice');
		expect(kebab('foo/bar baz')).toBe('foo-bar-baz');
		expect(kebab('v1.2.3-rc.1')).toBe('v1-2-3-rc-1');
	});

	it('returns empty string for whitespace-only input', async () => {
		expect(kebab('   ')).toBe('');
		expect(kebab('')).toBe('');
	});

	it('preserves digits as-is', async () => {
		expect(kebab('S1 S2 S3')).toBe('s1-s2-s3');
		expect(kebab('42')).toBe('42');
	});

	// x00157 S1 — documents (does not fix) the ASCII-only asymmetry:
	// non-ASCII titles collapse to '', truncate, or drop characters.
	// The fix lives in the caller via `slugFromTitle`, not here.
	it('documents the non-ASCII asymmetry that motivated slugFromTitle', async () => {
		expect(kebab('提案')).toBe('');
		expect(kebab('привет')).toBe('');
		expect(kebab('你好')).toBe('');
		expect(kebab('café')).toBe('cafe');
		expect(kebab('Auditoría')).toBe('auditoria');
		expect(kebab('🚀 emoji')).toBe('emoji');
	});
});

describe('slugFromTitle', async () => {
	it('returns the kebab slug for an ordinary ASCII title', async () => {
		expect(slugFromTitle('My Cool Slice', 'f00042')).toBe('my-cool-slice');
	});

	it('falls back to the given id for a non-ASCII title (the collision fix)', async () => {
		expect(slugFromTitle('提案', 'f00042')).toBe('f00042');
		expect(slugFromTitle('привет', 'f00001')).toBe('f00001');
	});

	it('falls back for an empty or whitespace-only title', async () => {
		expect(slugFromTitle('', 'x00099')).toBe('x00099');
		expect(slugFromTitle('   ', 'x00099')).toBe('x00099');
	});

	it('two different non-ASCII titles with the same fallback id would collide — callers must pass a per-item-unique fallback', async () => {
		// Documents the contract: slugFromTitle itself cannot invent
		// uniqueness it wasn't given. Callers building filenames use the
		// already-unique proposal id; callers building dedup keys for
		// MULTIPLE items in one file (migrate-foreign.ts) must include
		// an extra positional discriminator in the fallback they pass.
		expect(slugFromTitle('提案', 'shared-fallback')).toBe(
			slugFromTitle('审核', 'shared-fallback'),
		);
	});
});
