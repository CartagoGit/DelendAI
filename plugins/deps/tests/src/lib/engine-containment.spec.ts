/**
 * engine-containment.spec.ts — the dependency engine reads a manifest
 * that really is inside the workspace, and refuses one that only looks
 * like it is.
 *
 * `manifestRel` and `lockfileRel` are caller input: a tool argument or a
 * host option. The lexical containment check they used is a string
 * comparison, so `workspace/linked/package.json` passed it while
 * `linked` pointed at another tree — handing back that tree's
 * dependency list. Physical containment resolves the real path first.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildDepTree, listDeps } from '../../../src/lib/services/engine';

describe('deps engine workspace containment', () => {
	let parent = '';
	let workspace = '';
	let outside = '';

	beforeEach(async () => {
		parent = await mkdtemp(join(tmpdir(), 'deps-containment-'));
		workspace = join(parent, 'workspace');
		outside = join(parent, 'outside');
		await mkdir(workspace, { recursive: true });
		await mkdir(outside, { recursive: true });
		await writeFile(
			join(workspace, 'package.json'),
			JSON.stringify({ dependencies: { inside: '1.0.0' } }),
			'utf8',
		);
		await writeFile(
			join(outside, 'package.json'),
			JSON.stringify({ dependencies: { secret: '9.9.9' } }),
			'utf8',
		);
	});

	afterEach(async () => {
		await rm(parent, { recursive: true, force: true });
	});

	it('reads a manifest that really is inside the workspace', async () => {
		const inventory = await listDeps(workspace, 'package.json');

		expect(inventory.found).toBe(true);
		expect(inventory.deps.map((entry) => entry.name)).toContain('inside');
	});

	it('refuses a manifest that traverses out of the workspace', async () => {
		const inventory = await listDeps(workspace, '../outside/package.json');

		expect(inventory.found).toBe(false);
	});

	it('refuses a manifest reached through a symlink that leaves the workspace', async () => {
		// `linked/package.json` never leaves the workspace as a string,
		// which is exactly why the lexical check accepted it.
		await symlink(outside, join(workspace, 'linked'), 'dir');

		const inventory = await listDeps(workspace, 'linked/package.json');

		expect(inventory.found).toBe(false);
		// The outside tree's dependency must not appear anywhere.
		expect(inventory.deps.map((entry) => entry.name)).not.toContain(
			'secret',
		);
	});

	it('builds an empty tree from a manifest behind an escaping symlink', async () => {
		await symlink(outside, join(workspace, 'linked'), 'dir');

		const tree = await buildDepTree(workspace, 'linked/package.json');

		// The outside manifest's dependency must not become a node.
		expect(tree.root.children).toEqual([]);
		expect(tree.totalNodes).toBe(0);
	});
});
