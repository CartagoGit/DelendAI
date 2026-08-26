import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';

describe('managed lazy assembly defaults', () => {
	const workspaces: string[] = [];

	afterEach(() => {
		for (const workspace of workspaces.splice(0)) {
			rmSync(workspace, { recursive: true, force: true });
		}
	});

	it('uses lazy module loading when managedSurface.loading is omitted', async () => {
		const workspace = mkdtempSync(join(tmpdir(), 'mcp-vertex-lazy-'));
		workspaces.push(workspace);
		const args = parseCliArgs(
			[`--plugins=memory`, `--workspace=${workspace}`],
			workspace,
		);
		const assembled = await assembleCliConfig(args, {
			readFile: async () => undefined,
			import: async () => ({
				default: {
					name: 'memory',
					register: () => ({ tools: [] }),
				},
			}),
		});

		expect(assembled.loadResult.loaded).toEqual([]);
		expect(assembled.startupReport.runtime.moduleLoading).toBe('lazy');
		expect(
			assembled.config.lazyToolActivators?.has('mcp-vertex_memory_save'),
		).toBe(true);
		const descriptor = assembled.config.toolSurfacePlan?.descriptors.find(
			(entry) => entry.registrationId === 'mcp-vertex_memory_save',
		);
		expect(descriptor?.summary).toBeTruthy();
		expect(descriptor?.tags).toContain('lazy');
	});

	it('keeps explicit native surface on the eager compatibility path', async () => {
		const workspace = mkdtempSync(join(tmpdir(), 'mcp-vertex-native-'));
		workspaces.push(workspace);
		const args = parseCliArgs(
			[
				`--surface=native`,
				`--plugins=memory`,
				`--workspace=${workspace}`,
			],
			workspace,
		);
		const assembled = await assembleCliConfig(args, {
			readFile: async (absolutePath) =>
				absolutePath.endsWith('mcp-vertex.config.json')
					? JSON.stringify({ managedSurface: { loading: 'lazy' } })
					: undefined,
			import: async () => ({
				default: {
					name: 'memory',
					register: () => ({ tools: [] }),
				},
			}),
		});

		expect(assembled.startupReport.runtime.moduleLoading).toBe('eager');
		expect(assembled.config.lazyToolActivators).toBeUndefined();
		expect(assembled.loadResult.loaded).toHaveLength(1);
	});
});
