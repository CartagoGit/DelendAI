/**
 * A plugin the generated catalog cannot list (one a project ships
 * itself) is discovered and served lazily from the first start: eager
 * loading is only ever declared.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { useLocalLazyEntries } from '@delendai/core/lib/plugins/managed-lazy-catalog-lookup';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';

const PLUGIN = `export default {
	name: 'acme-app',
	register: () => ({ tools: [{ id: 'acme_build', register: async () => undefined }] }),
};
`;

describe('a project-local plugin', () => {
	const workspaces: string[] = [];
	afterEach(() => {
		useLocalLazyEntries([]);
		for (const workspace of workspaces.splice(0))
			rmSync(workspace, { recursive: true, force: true });
	});

	const assemble = async (config?: object) => {
		const workspace = mkdtempSync(join(tmpdir(), 'delendai-local-lazy-'));
		workspaces.push(workspace);
		const plugin = join(workspace, 'acme-plugin.mjs');
		writeFileSync(plugin, PLUGIN);
		const assembled = await assembleCliConfig(
			parseCliArgs(
				[`--plugins=${plugin}`, `--workspace=${workspace}`],
				workspace,
			),
			{
				readFile: async (path: string) =>
					config !== undefined &&
					path.endsWith('delendai.config.json')
						? JSON.stringify(config)
						: undefined,
			},
		);
		return { assembled, workspace };
	};

	it('is served lazily on the first start, and its surface is recorded', async () => {
		const { assembled, workspace } = await assemble();
		expect(assembled.startupReport.runtime.moduleLoading).toBe('lazy');
		expect(
			assembled.config.lazyToolActivators?.has(
				'delendai_acme-app_acme_build',
			),
		).toBe(true);
		expect(
			existsSync(
				join(
					workspace,
					'.cache',
					'delendai',
					'managed-lazy-local.json',
				),
			),
		).toBe(true);
	});

	it('is loaded eagerly only when the project declares it', async () => {
		const { assembled } = await assemble({
			managedSurface: { loading: 'eager' },
		});
		expect(assembled.startupReport.runtime.moduleLoading).toBe('eager');
	});
});
