import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	findWorkspaceConsumers,
	rewriteWorkspaceDeps,
	stageBuildForPublish,
	type IWorkspaceDepsPlan,
} from './workspace-deps.ts';

const createdDirs: string[] = [];

const plan = (
	packageVersions: Readonly<Record<string, string>> = {
		'@mcp-vertex/core': '2.0.0',
		'@mcp-vertex/client': '2.0.0',
	},
): IWorkspaceDepsPlan => ({
	packageVersions: new Map(Object.entries(packageVersions)),
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
	it('stages centralized build output as package-local dist without copying build inputs', async () => {
		const root = await mkdtemp(join(tmpdir(), 'workspace-deps-'));
		createdDirs.push(root);
		const pkgDir = await writePackageJson(root, 'pkg', {
			name: 'fixture',
			files: ['dist', 'README.md'],
		});
		await writeFile(join(pkgDir, 'README.md'), 'fixture\n', 'utf8');
		const buildDir = join(root, 'build', 'packages', 'fixture', '1.0.0');
		await mkdir(buildDir, { recursive: true });
		await writeFile(join(buildDir, 'index.js'), 'export {}\n', 'utf8');
		const stageDir = join(root, 'stage');

		await stageBuildForPublish(pkgDir, buildDir, stageDir);

		expect(await readFile(join(stageDir, 'dist', 'index.js'), 'utf8')).toBe(
			'export {}\n',
		);
		expect(await readFile(join(stageDir, 'README.md'), 'utf8')).toBe(
			'fixture\n',
		);
		await expect(
			readFile(
				join(
					stageDir,
					'build',
					'packages',
					'fixture',
					'1.0.0',
					'index.js',
				),
				'utf8',
			),
		).rejects.toMatchObject({ code: 'ENOENT' });
	});

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
			new Set(plan().packageVersions.keys()),
		);

		expect(consumers).toEqual([
			join(root, 'a', 'package.json'),
			join(root, 'b', 'package.json'),
		]);
	});

	it('per-package-version resolves each dependency to ITS OWN version, not a shared/root version', async () => {
		const root = await mkdtemp(join(tmpdir(), 'workspace-deps-'));
		createdDirs.push(root);
		// The regression this covers: a monorepo root at 0.1.0 with a
		// dependency that has independently bumped ahead to 0.1.1. A plan
		// keyed per-package must resolve to 0.1.1, never fall back to a
		// single shared/root version like 0.1.0.
		const pkgDir = await writePackageJson(root, 'pkg', {
			name: 'fixture',
			dependencies: {
				'@mcp-vertex/core': 'workspace:*',
				'@mcp-vertex/web-fetch': 'workspace:*',
			},
		});

		const result = await rewriteWorkspaceDeps(
			pkgDir,
			plan({
				'@mcp-vertex/core': '0.1.0',
				'@mcp-vertex/web-fetch': '0.1.1',
			}),
		);

		expect(result.rewritten.dependencies).toEqual({
			'@mcp-vertex/core': '0.1.0',
			'@mcp-vertex/web-fetch': '0.1.1',
		});
		expect(result.changedKeys).toEqual([
			'@mcp-vertex/core',
			'@mcp-vertex/web-fetch',
		]);
	});

	it('every-dependency-kind rewrites workspace: ranges in dependencies, devDependencies, peerDependencies, and optionalDependencies alike', async () => {
		const root = await mkdtemp(join(tmpdir(), 'workspace-deps-'));
		createdDirs.push(root);
		const pkgDir = await writePackageJson(root, 'pkg', {
			name: 'fixture',
			dependencies: { '@mcp-vertex/core': 'workspace:*' },
			devDependencies: { '@mcp-vertex/core': 'workspace:*' },
			peerDependencies: { '@mcp-vertex/core': 'workspace:*' },
			optionalDependencies: { '@mcp-vertex/core': 'workspace:*' },
		});

		const result = await rewriteWorkspaceDeps(
			pkgDir,
			plan({ '@mcp-vertex/core': '3.4.5' }),
		);

		expect(result.rewritten).toMatchObject({
			dependencies: { '@mcp-vertex/core': '3.4.5' },
			devDependencies: { '@mcp-vertex/core': '3.4.5' },
			peerDependencies: { '@mcp-vertex/core': '3.4.5' },
			optionalDependencies: { '@mcp-vertex/core': '3.4.5' },
		});
	});

	it.each([
		['workspace:*', '1.2.3', '1.2.3'],
		['workspace:^', '1.2.3', '^1.2.3'],
		['workspace:~', '1.2.3', '~1.2.3'],
	])(
		"protocol-forms resolves %s against the target's own version %s to %s",
		async (range, targetVersion, expected) => {
			const root = await mkdtemp(join(tmpdir(), 'workspace-deps-'));
			createdDirs.push(root);
			const pkgDir = await writePackageJson(root, 'pkg', {
				name: 'fixture',
				dependencies: { '@mcp-vertex/core': range },
			});

			const result = await rewriteWorkspaceDeps(
				pkgDir,
				plan({ '@mcp-vertex/core': targetVersion }),
			);

			expect(result.rewritten.dependencies).toEqual({
				'@mcp-vertex/core': expected,
			});
		},
	);

	it('unknown-protocol throws a bounded parse error instead of silently mis-resolving', async () => {
		const root = await mkdtemp(join(tmpdir(), 'workspace-deps-'));
		createdDirs.push(root);
		const pkgDir = await writePackageJson(root, 'pkg', {
			name: 'fixture',
			dependencies: { '@mcp-vertex/core': 'workspace:1.2.3' },
		});

		await expect(
			rewriteWorkspaceDeps(pkgDir, plan({ '@mcp-vertex/core': '2.0.0' })),
		).rejects.toMatchObject({ code: 'ERR_WORKSPACE_DEPS_PARSE' });
	});
});
