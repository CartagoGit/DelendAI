/**
 * installed-framework.helper.spec.ts — in a monorepo the framework is a
 * dependency of the package that uses it, and a mixed repo can pick one.
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveInstalledFramework } from '../../../../src/lib/resolve/installed-framework.helper';

const roots: string[] = [];

afterEach(async () => {
	for (const root of roots.splice(0))
		await rm(root, { recursive: true, force: true });
});

const manifest = async (
	dir: string,
	body: Record<string, unknown>,
): Promise<void> => {
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, 'package.json'), JSON.stringify(body));
};

describe('resolveInstalledFramework', () => {
	it('finds each framework of a mixed monorepo in the package that depends on it', async () => {
		const root = await mkdtemp(join(tmpdir(), 'installed-framework-'));
		roots.push(root);
		await manifest(root, { name: 'repo', workspaces: ['apps/*'] });
		await manifest(join(root, 'apps', 'admin'), {
			name: 'admin',
			dependencies: { '@angular/core': '^19.0.0' },
		});
		await manifest(join(root, 'apps', 'site'), {
			name: 'site',
			dependencies: { next: '^15.0.0' },
		});
		expect(
			(await resolveInstalledFramework(root, 'next'))?.frameworkId,
		).toBe('next');
		expect(
			(await resolveInstalledFramework(root, 'angular'))?.frameworkId,
		).toBe('angular');
		expect((await resolveInstalledFramework(root))?.frameworkId).toBe(
			'angular',
		);
	});

	it('finds nothing in a project with no framework dependency', async () => {
		const root = await mkdtemp(join(tmpdir(), 'installed-framework-'));
		roots.push(root);
		await manifest(root, { name: 'repo' });
		expect(await resolveInstalledFramework(root)).toBeUndefined();
	});
});
