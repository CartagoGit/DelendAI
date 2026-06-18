import { resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveWorkspaceContained } from '@mcp-vertex/core/public';

const ROOT = resolve('/work/space');

describe('resolveWorkspaceContained — workspace containment guard', () => {
	it('accepts a plain relative child inside the root', () => {
		const r = resolveWorkspaceContained(ROOT, 'docs');
		expect(r.ok).toBe(true);
		expect(r.abs).toBe(resolve(ROOT, 'docs'));
		expect(r.rel).toBe('docs');
	});

	it('accepts nested relative paths and normalizes to forward slashes', () => {
		const r = resolveWorkspaceContained(ROOT, 'a/b/c.md');
		expect(r.ok).toBe(true);
		expect(r.rel).toBe('a/b/c.md');
	});

	it("treats the root itself ('.') as contained", () => {
		const r = resolveWorkspaceContained(ROOT, '.');
		expect(r.ok).toBe(true);
		expect(r.rel).toBe('.');
	});

	it("collapses interior '..' that stays inside the root", () => {
		const r = resolveWorkspaceContained(ROOT, 'a/../b');
		expect(r.ok).toBe(true);
		expect(r.rel).toBe('b');
	});

	it("rejects a bare '..' escaping the root", () => {
		const r = resolveWorkspaceContained(ROOT, '..');
		expect(r.ok).toBe(false);
		expect(r.reason).toMatch(/escapes workspace/);
	});

	it("rejects deep '../' traversal", () => {
		const r = resolveWorkspaceContained(ROOT, '../../etc/passwd');
		expect(r.ok).toBe(false);
		expect(r.reason).toMatch(/escapes workspace/);
	});

	it("rejects a child that climbs out then back to a sibling", () => {
		const r = resolveWorkspaceContained(ROOT, 'a/../../space-evil/x');
		expect(r.ok).toBe(false);
	});

	it('rejects an absolute path even if it points inside the root', () => {
		const inside = `${ROOT}${sep}docs`;
		const r = resolveWorkspaceContained(ROOT, inside);
		expect(r.ok).toBe(false);
		expect(r.reason).toMatch(/absolute path not allowed/);
	});

	it('rejects an absolute path outside the root', () => {
		const r = resolveWorkspaceContained(ROOT, '/etc/passwd');
		expect(r.ok).toBe(false);
		expect(r.reason).toMatch(/absolute path not allowed/);
	});
});
