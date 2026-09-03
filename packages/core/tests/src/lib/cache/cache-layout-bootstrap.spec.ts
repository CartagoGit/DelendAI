import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { bootstrapCacheLayout } from '@mcp-vertex/core/lib/cache/cache-layout-bootstrap';
import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

const workspaces: string[] = [];

afterEach(() => {
	for (const workspace of workspaces.splice(0))
		removeTestWorkspace(workspace);
});

describe('bootstrapCacheLayout', () => {
	it('moves legacy runtime directories into the resolved cache root', async () => {
		const workspace = createTestWorkspace('mcp-vertex-cache-');
		workspaces.push(workspace);
		const legacy = join(workspace, '.commit-policy');
		await mkdir(legacy);
		await writeFile(
			join(legacy, 'processed-events.jsonl'),
			'{"key":"k"}\n',
		);

		const result = await bootstrapCacheLayout({
			workspaceRootAbs: workspace,
			cacheDirAbs: '.runtime/cache',
			createPluginDirs: true,
		});

		expect(result.migrated).toHaveLength(1);
		expect(
			await readFile(
				join(
					workspace,
					'.runtime/cache/commit-policy/processed-events.jsonl',
				),
				'utf8',
			),
		).toContain('"key"');
	});

	it('accepts an absolute contained cacheDirAbs', async () => {
		const workspace = createTestWorkspace('mcp-vertex-cache-');
		workspaces.push(workspace);
		const cacheDir = join(workspace, '.runtime/cache');
		await mkdir(join(workspace, '.commit-policy'));
		await writeFile(
			join(workspace, '.commit-policy', 'processed-events.jsonl'),
			'{"key":"absolute"}\n',
		);

		const result = await bootstrapCacheLayout({
			workspaceRootAbs: workspace,
			cacheDirAbs: cacheDir,
			createPluginDirs: true,
		});

		expect(result.cacheDirAbs).toBe(cacheDir);
		expect(
			await readFile(
				join(cacheDir, 'commit-policy', 'processed-events.jsonl'),
				'utf8',
			),
		).toContain('"key":"absolute"');
	});

	it('preserves an existing canonical directory and is idempotent', async () => {
		const workspace = createTestWorkspace('mcp-vertex-cache-');
		workspaces.push(workspace);
		await mkdir(join(workspace, '.commit-policy'));
		await mkdir(join(workspace, '.runtime/cache/commit-policy'), {
			recursive: true,
		});

		const result = await bootstrapCacheLayout({
			workspaceRootAbs: workspace,
			cacheDirAbs: '.runtime/cache',
			createPluginDirs: true,
		});

		expect(result.migrated).toHaveLength(0);
		expect(result.created).toContain(
			join(workspace, '.runtime/cache/verify-tmp'),
		);
	});

	it('removes an empty doubly-nested legacy cache root', async () => {
		const workspace = createTestWorkspace('mcp-vertex-cache-');
		workspaces.push(workspace);
		const cacheDir = join(workspace, '.runtime/cache');
		await mkdir(join(cacheDir, '.cache/mcp-vertex/cache'), {
			recursive: true,
		});

		await bootstrapCacheLayout({
			workspaceRootAbs: workspace,
			cacheDirAbs: cacheDir,
		});

		await expect(readFile(join(cacheDir, '.cache'))).rejects.toThrow();
	});

	it('preserves non-empty doubly-nested cache data', async () => {
		const workspace = createTestWorkspace('mcp-vertex-cache-');
		workspaces.push(workspace);
		const cacheDir = join(workspace, '.runtime/cache');
		const nestedFile = join(cacheDir, '.cache/mcp-vertex/state.json');
		await mkdir(join(cacheDir, '.cache/mcp-vertex'), { recursive: true });
		await writeFile(nestedFile, '{"keep":true}\n');

		await bootstrapCacheLayout({
			workspaceRootAbs: workspace,
			cacheDirAbs: cacheDir,
		});

		expect(await readFile(nestedFile, 'utf8')).toContain('"keep":true');
	});

	it('reports legacy paths without changing the workspace in dry-run mode', async () => {
		const workspace = createTestWorkspace('mcp-vertex-cache-');
		workspaces.push(workspace);
		const legacy = join(workspace, '.verify-tmp');
		await mkdir(legacy);

		const result = await bootstrapCacheLayout({
			workspaceRootAbs: workspace,
			cacheDirAbs: '.runtime/cache',
			apply: false,
		});

		expect(result.pending).toEqual([
			{
				from: legacy,
				to: join(workspace, '.runtime/cache/verify-tmp'),
			},
		]);
		expect(result.migrated).toHaveLength(0);
	});

	it('moves a legacy file without treating it as a directory', async () => {
		const workspace = createTestWorkspace('mcp-vertex-cache-');
		workspaces.push(workspace);
		const legacy = join(
			workspace,
			'.commit-policy',
			'processed-events.jsonl',
		);
		await mkdir(join(workspace, '.commit-policy'), { recursive: true });
		await writeFile(legacy, '{"key":"file"}\n');

		const result = await bootstrapCacheLayout({
			workspaceRootAbs: workspace,
			cacheDirAbs: '.runtime/cache',
			includeBuiltInLegacyPaths: false,
			legacyPaths: [
				{
					sourceAbs: legacy,
					destinationAbs: join(
						workspace,
						'.runtime/cache/commit-policy/processed-events.jsonl',
					),
				},
			],
		});

		expect(result.migrated).toHaveLength(1);
		const target = result.migrated[0]?.to;
		expect(target).toBeDefined();
		expect(await readFile(target!, 'utf8')).toContain('"file"');
	});
});
