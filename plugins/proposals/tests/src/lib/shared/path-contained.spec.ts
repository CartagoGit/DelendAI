import { describe, expect, it } from 'vitest';
import { join, sep, win32 } from 'node:path';

import {
	isContained,
	isContainedWithReason,
} from '@delendai/proposals/lib/shared/path-contained';

describe('isContained (platform-aware path containment)', () => {
	it('returns true for a strict sub-path on POSIX', () => {
		const root = join(sep, 'repo', 'docs', 'proposals');
		const child = join(root, 'ready', 'foo.md');
		expect(isContained(child, root)).toBe(true);
	});

	it('returns true for a strict sub-path on Windows (using path.win32)', () => {
		const root = win32.join('C:', 'repo', 'docs', 'proposals');
		const child = win32.join(root, 'ready', 'foo.md');
		expect(isContained(child, root)).toBe(true);
	});

	it('returns false when the child equals the parent (root does not contain itself)', () => {
		const root = join(sep, 'repo', 'docs', 'proposals');
		expect(isContained(root, root)).toBe(false);
		expect(isContainedWithReason(root, root).reason).toBe(
			'child-equals-parent',
		);
	});

	it('returns false for a parent-escape attempt', () => {
		const root = join(sep, 'repo', 'docs', 'proposals');
		const escape = join(sep, 'repo', 'docs', 'OTHER', 'foo.md');
		expect(isContained(escape, root)).toBe(false);
		expect(isContainedWithReason(escape, root).reason).toBe(
			'parent-escape',
		);
	});

	it('returns the reason "inside" when contained, with the computed relative', () => {
		const root = join(sep, 'repo', 'docs', 'proposals');
		const child = join(root, 'ready', 'foo.md');
		const result = isContainedWithReason(child, root);
		expect(result.contained).toBe(true);
		expect(result.reason).toBe('inside');
		expect(result.relative).toBe(join('ready', 'foo.md'));
	});

	it('rejects relative paths defensively', () => {
		expect(isContained('relative/child', 'relative/parent')).toBe(false);
		expect(
			isContainedWithReason('relative/child', 'relative/parent').reason,
		).toBe('absolute-on-child');
	});

	it('rejects the legacy POSIX pattern that started-with the parent prefix', () => {
		// The previous broken check
		// `child.startsWith(\`${parent}/\`)` was true on POSIX for
		// `/a/b/c` vs `/a/b` but false on Windows for the same
		// paths. The new helper handles both.
		const posixRoot = '/a/b';
		const posixChild = '/a/b/c';
		expect(isContained(posixChild, posixRoot)).toBe(true);

		const winRoot = win32.join('C:', 'a', 'b');
		const winChild = win32.join(winRoot, 'c');
		expect(isContained(winChild, winRoot)).toBe(true);

		// A POSIX-rooted path passed into a Windows call must NOT
		// accidentally match — `relative()` would produce something
		// platform-incoherent. The platform of the input is what
		// matters: both helpers receive already-joined absolute
		// paths from `path.join` or `path.win32.join` upstream, so
		// the test runs the POSIX case and the Windows case
		// independently.
	});
});
