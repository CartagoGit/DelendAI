import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { projectSearchRoots } from '../../../../src/lib/services/project-roots.helper';

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});
const project = (manifest: object | undefined, folders: string[] = []) => {
	const root = mkdtempSync(join(tmpdir(), 'project-roots-'));
	dirs.push(root);
	if (manifest !== undefined)
		writeFileSync(join(root, 'package.json'), JSON.stringify(manifest));
	for (const folder of folders)
		mkdirSync(join(root, folder), { recursive: true });
	return root;
};

describe('projectSearchRoots', () => {
	it('reads the folders the workspaces name, present ones only', async () => {
		const root = project(
			{ workspaces: ['services/*', './libs/*', 'gone/*'] },
			['services/api', 'libs/util'],
		);
		expect(await projectSearchRoots(root)).toEqual(['services', 'libs']);
	});

	it('reads the yarn object form', async () => {
		const root = project({ workspaces: { packages: ['modules/*'] } }, [
			'modules/a',
		]);
		expect(await projectSearchRoots(root)).toEqual(['modules']);
	});

	it('searches the whole project when it declares no workspaces', async () => {
		expect(
			await projectSearchRoots(project({ name: 'app' }, ['src'])),
		).toBeUndefined();
		expect(await projectSearchRoots(project(undefined))).toBeUndefined();
	});
});
