/**
 * real-deps.spec.ts — the dependency diagram reads the packages the root
 * `package.json` workspaces declare, whatever folders they live in.
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { realDiagramDeps } from '../../../../src/lib/graph/real-deps';

const roots: string[] = [];

afterEach(async () => {
	for (const root of roots.splice(0))
		await rm(root, { recursive: true, force: true });
});

const manifest = async (
	dir: string,
	name: string,
	dependencies: Record<string, string> = {},
): Promise<void> => {
	await mkdir(dir, { recursive: true });
	await writeFile(
		join(dir, 'package.json'),
		JSON.stringify({ name, dependencies }),
	);
};

describe('realDiagramDeps', () => {
	it('reads every package the workspaces declare, in any folder', async () => {
		const root = await mkdtemp(join(tmpdir(), 'diagram-deps-'));
		roots.push(root);
		await writeFile(
			join(root, 'package.json'),
			JSON.stringify({
				name: 'repo',
				workspaces: ['libs/*', 'tools', 'services/**'],
			}),
		);
		await manifest(join(root, 'libs', 'a'), '@x/a', { '@x/b': '1' });
		await manifest(join(root, 'libs', 'b'), '@x/b');
		await manifest(join(root, 'tools'), '@x/tools');
		await manifest(join(root, 'services', 'group', 'api'), '@x/api');
		// Not declared: not part of the graph.
		await manifest(join(root, 'packages', 'stray'), '@x/stray');

		const names = (await realDiagramDeps(root).listWorkspacePackages())
			.map((pkg) => pkg.name)
			.sort();
		expect(names).toEqual(['@x/a', '@x/api', '@x/b', '@x/tools', 'repo']);
	});

	it('reads the packages form of workspaces', async () => {
		const root = await mkdtemp(join(tmpdir(), 'diagram-deps-'));
		roots.push(root);
		await writeFile(
			join(root, 'package.json'),
			JSON.stringify({
				name: 'repo',
				workspaces: { packages: ['mods/*'] },
			}),
		);
		await manifest(join(root, 'mods', 'one'), '@x/one');
		const names = (await realDiagramDeps(root).listWorkspacePackages()).map(
			(pkg) => pkg.name,
		);
		expect(names).toEqual(['repo', '@x/one']);
	});
});
