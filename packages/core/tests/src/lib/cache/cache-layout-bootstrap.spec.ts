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
});
