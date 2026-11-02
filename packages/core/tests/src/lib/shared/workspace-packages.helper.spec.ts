/**
 * workspace-packages.helper.spec.ts — the package folders a project's
 * root workspaces declare, in every form a manifest writes them.
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { workspacePackageDirs } from '../../../../src/lib/shared/workspace-packages.helper';

const roots: string[] = [];

afterEach(async () => {
	for (const root of roots.splice(0))
		await rm(root, { recursive: true, force: true });
});

const project = async (workspaces: unknown, dirs: readonly string[]) => {
	const root = await mkdtemp(join(tmpdir(), 'workspace-packages-'));
	roots.push(root);
	await writeFile(join(root, 'package.json'), JSON.stringify({ workspaces }));
	for (const dir of dirs) await mkdir(join(root, dir), { recursive: true });
	return root;
};

describe('workspacePackageDirs', () => {
	it('expands dir/*, dir/** and plain paths, skipping dependencies', async () => {
		const root = await project(
			['libs/*', './tools/', 'services/**', 'libs/*'],
			[
				'libs/a',
				'libs/b',
				'libs/node_modules',
				'tools',
				'services/group/api',
			],
		);
		expect(await workspacePackageDirs(root)).toEqual([
			'libs/a',
			'libs/b',
			'tools',
			'services/group',
			'services/group/api',
		]);
	});

	it('reads the packages form, and nothing from a manifest without workspaces', async () => {
		const root = await project({ packages: ['mods/*'] }, ['mods/one']);
		expect(await workspacePackageDirs(root)).toEqual(['mods/one']);
		const plain = await project(undefined, ['src']);
		expect(await workspacePackageDirs(plain)).toEqual([]);
	});

	it('names nothing for an unreadable manifest or a glob it cannot expand', async () => {
		const root = await mkdtemp(join(tmpdir(), 'workspace-packages-'));
		roots.push(root);
		await writeFile(join(root, 'package.json'), '{');
		expect(await workspacePackageDirs(root)).toEqual([]);
		const odd = await project(['{a,b}', 7], ['a']);
		expect(await workspacePackageDirs(odd)).toEqual([]);
	});
});
