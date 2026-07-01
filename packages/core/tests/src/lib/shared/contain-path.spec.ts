import { resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	resolveAgainstRoots,
	resolveWorkspaceContained,
} from '@mcp-vertex/core/public';

const ROOT = resolve('/work/space');

describe('resolveWorkspaceContained — workspace containment guard', async () => {
	it('accepts a plain relative child inside the root', async () => {
		const r = resolveWorkspaceContained(ROOT, 'docs');
		expect(r.ok).toBe(true);
		expect(r.abs).toBe(resolve(ROOT, 'docs'));
		expect(r.rel).toBe('docs');
	});

	it('accepts nested relative paths and normalizes to forward slashes', async () => {
		const r = resolveWorkspaceContained(ROOT, 'a/b/c.md');
		expect(r.ok).toBe(true);
		expect(r.rel).toBe('a/b/c.md');
	});

	it("treats the root itself ('.') as contained", async () => {
		const r = resolveWorkspaceContained(ROOT, '.');
		expect(r.ok).toBe(true);
		expect(r.rel).toBe('.');
	});

	it("collapses interior '..' that stays inside the root", async () => {
		const r = resolveWorkspaceContained(ROOT, 'a/../b');
		expect(r.ok).toBe(true);
		expect(r.rel).toBe('b');
	});

	it("rejects a bare '..' escaping the root", async () => {
		const r = resolveWorkspaceContained(ROOT, '..');
		expect(r.ok).toBe(false);
		expect(r.reason).toMatch(/escapes workspace/);
	});

	it("rejects deep '../' traversal", async () => {
		const r = resolveWorkspaceContained(ROOT, '../../etc/passwd');
		expect(r.ok).toBe(false);
		expect(r.reason).toMatch(/escapes workspace/);
	});

	it('rejects a child that climbs out then back to a sibling', async () => {
		const r = resolveWorkspaceContained(ROOT, 'a/../../space-evil/x');
		expect(r.ok).toBe(false);
	});

	it('rejects an absolute path even if it points inside the root', async () => {
		const inside = `${ROOT}${sep}docs`;
		const r = resolveWorkspaceContained(ROOT, inside);
		expect(r.ok).toBe(false);
		expect(r.reason).toMatch(/absolute path not allowed/);
	});

	it('rejects an absolute path outside the root', async () => {
		const r = resolveWorkspaceContained(ROOT, '/etc/passwd');
		expect(r.ok).toBe(false);
		expect(r.reason).toMatch(/absolute path not allowed/);
	});
});

describe('resolveAgainstRoots — authorized-roots allowlist (f00089 U5)', async () => {
	const EXTERNAL = resolve('/data/shared');

	it('with an empty allowlist is byte-identical to resolveWorkspaceContained', async () => {
		for (const child of [
			'docs',
			'a/b/c.md',
			'.',
			'a/../b',
			'..',
			'../../etc/passwd',
			`${ROOT}${sep}docs`,
			'/etc/passwd',
		]) {
			expect(resolveAgainstRoots(ROOT, [], child)).toEqual(
				resolveWorkspaceContained(ROOT, child),
			);
		}
	});

	it('keeps reading a relative path inside the workspace (no change)', async () => {
		const r = resolveAgainstRoots(ROOT, [EXTERNAL], 'docs/readme.md');
		expect(r.ok).toBe(true);
		expect(r.abs).toBe(resolve(ROOT, 'docs/readme.md'));
		expect(r.rel).toBe('docs/readme.md');
	});

	it('rejects an external absolute path that is NOT under any authorized root', async () => {
		const r = resolveAgainstRoots(ROOT, [EXTERNAL], '/etc/passwd');
		expect(r.ok).toBe(false);
		// Surfaces the workspace rejection reason (absolute not allowed).
		expect(r.reason).toMatch(/absolute path not allowed/);
	});

	it('accepts an absolute path that falls INSIDE an authorized root', async () => {
		const inside = `${EXTERNAL}${sep}notes${sep}x.md`;
		const r = resolveAgainstRoots(ROOT, [EXTERNAL], inside);
		expect(r.ok).toBe(true);
		expect(r.abs).toBe(resolve(EXTERNAL, 'notes/x.md'));
		expect(r.rel).toBe('notes/x.md');
	});

	it('treats an authorized root itself as contained', async () => {
		const r = resolveAgainstRoots(ROOT, [EXTERNAL], EXTERNAL);
		expect(r.ok).toBe(true);
		expect(r.rel).toBe('.');
	});

	it('rejects an absolute path OUTSIDE all authorized roots (sibling of one)', async () => {
		const sibling = `${resolve('/data')}${sep}other${sep}x.md`;
		const r = resolveAgainstRoots(ROOT, [EXTERNAL], sibling);
		expect(r.ok).toBe(false);
	});

	it("still rejects a relative '..' escape when it lands outside every root", async () => {
		const r = resolveAgainstRoots(ROOT, [EXTERNAL], '../../etc/passwd');
		expect(r.ok).toBe(false);
		expect(r.reason).toMatch(/escapes workspace/);
	});

	it('an absolute path inside an authorized root cannot be `..`-escaped back out', async () => {
		const escapePath = `${EXTERNAL}${sep}..${sep}other${sep}x.md`;
		const r = resolveAgainstRoots(ROOT, [EXTERNAL], escapePath);
		expect(r.ok).toBe(false);
	});

	it('tries the workspace first, then each authorized root in order', async () => {
		const SECOND = resolve('/data/second');
		const inSecond = `${SECOND}${sep}f.md`;
		const r = resolveAgainstRoots(ROOT, [EXTERNAL, SECOND], inSecond);
		expect(r.ok).toBe(true);
		expect(r.abs).toBe(resolve(SECOND, 'f.md'));
		expect(r.rel).toBe('f.md');
	});
});
