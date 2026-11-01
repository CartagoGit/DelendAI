import { describe, expect, it } from 'vitest';

import { toRelPosix } from '../../../../src/lib/scan/path-utils';

describe('scan/path-utils — toRelPosix', () => {
	it('converts a nested absolute path to a POSIX relative path', () => {
		const root = '/repo';
		const abs = '/repo/src/lib/foo/bar.ts';
		expect(toRelPosix(root, abs)).toBe('src/lib/foo/bar.ts');
	});

	it('returns ".." when the path is outside the root', () => {
		const root = '/repo';
		const abs = '/other/foo.ts';
		expect(toRelPosix(root, abs)).toBe('../other/foo.ts');
	});

	it('returns "" when the path equals the root', () => {
		const root = '/repo';
		expect(toRelPosix(root, root)).toBe('');
	});

	it('does not crash on inputs that contain backslashes', () => {
		// POSIX filenames can technically contain a backslash character.
		// The function should not throw and should return some path
		// (either the relative or the out-of-tree marker).
		const root = '/repo';
		const absWithBackslashes = '/repo\\src\\lib\\foo.ts';
		const out = toRelPosix(root, absWithBackslashes);
		expect(typeof out).toBe('string');
	});
});
