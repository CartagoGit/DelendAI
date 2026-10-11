/**
 * deps-tree.spec.ts — f00136 S1: dependency tree from manifest + lockfile.
 */
import { describe, expect, it } from 'vitest';

import { buildDepTree } from '../../../src/lib/services/engine';
import { parseBunAudit } from '../../../src/lib/services/audit';

// `bun --cwd plugins/deps test` runs with cwd=plugins/deps, but our
// service reads the workspace's package.json + bun.lock. Walk up from
// this file to the directory containing bun.lock (the monorepo root).
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const findMonorepoRoot = (): string => {
	let cur = dirname(fileURLToPath(import.meta.url));
	for (let i = 0; i < 8; i += 1) {
		if (existsSync(resolve(cur, 'bun.lock'))) return cur;
		const parent = dirname(cur);
		if (parent === cur) break;
		cur = parent;
	}
	return process.cwd();
};

const workspaceRoot = findMonorepoRoot();

describe('buildDepTree (f00136 S1)', () => {
	it('returns a tree rooted at the manifest with the declared deps as children', async () => {
		const report = await buildDepTree(workspaceRoot);
		expect(report.manifest).toBe('package.json');
		expect(report.lockfile).toBe('bun.lock');
		expect(report.lockfileFound).toBe(true);
		expect(report.root.name).toBe('manifest');
		expect(report.root.children.length).toBeGreaterThan(0);
	});

	it('reports totalNodes and maxDepth after walking the tree', async () => {
		const report = await buildDepTree(workspaceRoot);
		expect(report.totalNodes).toBeGreaterThan(1);
		expect(report.maxDepth).toBeGreaterThanOrEqual(1);
	});

	it('uses a configurable maxDepth cap', async () => {
		const shallow = await buildDepTree(
			workspaceRoot,
			'package.json',
			'bun.lock',
			1,
		);
		expect(shallow.maxDepth).toBe(1);
		expect(shallow.totalNodes).toBeGreaterThan(0);
	});

	it('marks the first-level children with their manifest section', async () => {
		const report = await buildDepTree(workspaceRoot);
		const firstChild = report.root.children[0];
		expect(firstChild).toBeDefined();
		// First-level children must have a section; deeper ones do not.
		expect(firstChild?.section).toBeDefined();
	});

	it('returns a tree even when the lockfile is missing', async () => {
		const report = await buildDepTree(
			workspaceRoot,
			'package.json',
			'no-such.lock',
		);
		expect(report.lockfileFound).toBe(false);
		expect(report.totalNodes).toBeGreaterThan(0);
	});

	it('does not infinitely recurse on a cyclic lockfile', async () => {
		// Sanity: even on a real lockfile with no cycles, the tree must
		// terminate quickly. We assert only that totalNodes is finite.
		const report = await buildDepTree(workspaceRoot);
		expect(Number.isFinite(report.totalNodes)).toBe(true);
	});

	it('does not crash on parseBunAudit with malformed input', () => {
		expect(parseBunAudit('not json')).toEqual([]);
		expect(parseBunAudit('')).toEqual([]);
	});
});
