import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	findWorkspaceConsumers,
	rewriteWorkspaceDeps,
	type IWorkspaceDepsPlan,
} from './workspace-deps.ts';

const createdDirs: string[] = [];

const plan = (targetVersion = '2.0.0'): IWorkspaceDepsPlan => ({
	targetVersion,
	mcpVertexPackages: new Set(['@mcp-vertex/core', '@mcp-vertex/client']),
});

const writePackageJson = async (
	root: string,
	relDir: string,
	pkg: Record<string, unknown>,
): Promise<string> => {
	const dir = join(root, relDir);
	await mkdir(dir, { recursive: true });
	await writeFile(
		join(dir, 'package.json'),
		`${JSON.stringify(pkg, null, '\t')}\n`,
		'utf8',
	);
	return dir;
};

afterEach(async () => {
	await Promise.all(
		createdDirs
			.splice(0)
			.map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe('workspace-deps', () => {
	it('version-major rewrites workspace:* to the target version', async () => {
		const root = await mkdtemp(join(tmpdir(), 'workspace-deps-'));
		createdDirs.push(root);
		const pkgDir = await writePackageJson(root, 'pkg', {
			name: 'fixture',
			dependencies: {
				'@mcp-vertex/core': 'workspace:*',
			},
		});

		const result = await rewriteWorkspaceDeps(pkgDir, plan());

		expect(result.rewritten.dependencies).toEqual({
			'@mcp-vertex/core': '2.0.0',
		});
		expect(result.changedKeys).toEqual(['@mcp-vertex/core']);
		expect(
			JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8')),
		).toMatchObject({
			dependencies: { '@mcp-vertex/core': '2.0.0' },
		});
	});

	it('no-workspace returns unchanged with no changed keys', async () => {
		const root = await mkdtemp(join(tmpdir(), 'workspace-deps-'));
		createdDirs.push(root);
		const pkgDir = await writePackageJson(root, 'pkg', {
			name: 'fixture',
			dependencies: {
				'@mcp-vertex/core': '^1.2.3',
			},
		});

		const result = await rewriteWorkspaceDeps(pkgDir, plan());

		expect(result.changedKeys).toEqual([]);
		expect(result.rewritten.dependencies).toEqual({
			'@mcp-vertex/core': '^1.2.3',
		});
	});

	it('io-error throws a bounded error code when the package dir is missing', async () => {
		await expect(
			rewriteWorkspaceDeps('/tmp/does-not-exist-workspace-deps', plan()),
		).rejects.toMatchObject({ code: 'ERR_WORKSPACE_DEPS_IO' });
	});

	it('idempotence preserves the rewritten package on repeated calls', async () => {
		const root = await mkdtemp(join(tmpdir(), 'workspace-deps-'));
		createdDirs.push(root);
		const pkgDir = await writePackageJson(root, 'pkg', {
			name: 'fixture',
			dependencies: {
				'@mcp-vertex/core': 'workspace:*',
			},
		});

		const first = await rewriteWorkspaceDeps(pkgDir, plan());
		const second = await rewriteWorkspaceDeps(pkgDir, plan());

		expect(second.rewritten).toEqual(first.rewritten);
		expect(
			JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8')),
		).toMatchObject({
			dependencies: { '@mcp-vertex/core': '2.0.0' },
		});
	});

	it('workspace-consumer-finder finds matching package.json files under the root', async () => {
		const root = await mkdtemp(join(tmpdir(), 'workspace-deps-'));
		createdDirs.push(root);
		await writePackageJson(root, 'a', {
			name: 'a',
			dependencies: {
				'@mcp-vertex/core': 'workspace:*',
			},
		});
		await writePackageJson(root, 'b', {
			name: 'b',
			peerDependencies: {
				'@mcp-vertex/client': 'workspace:^',
			},
		});
		await writePackageJson(root, 'c', {
			name: 'c',
			dependencies: {
				leftpad: '^1.0.0',
			},
		});

		const consumers = await findWorkspaceConsumers(
			root,
			plan().mcpVertexPackages,
		);

		expect(consumers).toEqual([
			join(root, 'a', 'package.json'),
			join(root, 'b', 'package.json'),
		]);
	});
});
