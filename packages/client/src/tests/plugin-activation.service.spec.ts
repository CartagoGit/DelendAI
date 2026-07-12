import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { setPluginActivation } from '../lib/services/plugin-activation.service';

const roots: string[] = [];
const workspace = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'mcpv-activation-'));
	roots.push(root);
	return root;
};

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true })),
	);
});

describe('setPluginActivation', () => {
	it('merges a native enabled override without losing its path/options', async () => {
		const root = await workspace();
		const file = join(root, 'mcp-vertex.config.json');
		await writeFile(
			file,
			JSON.stringify({
				keepLegacy: true,
				plugins: { local: { path: './local.ts', options: { x: 1 } } },
			}),
		);
		await setPluginActivation({
			workspaceRoot: root,
			id: 'local',
			origin: 'user-local',
			active: false,
		});
		const value = JSON.parse(await readFile(file, 'utf8'));
		expect(value.keepLegacy).toBe(true);
		expect(value.plugins.local).toEqual({
			path: './local.ts',
			options: { x: 1 },
			enabled: false,
			origin: 'user-local',
		});
	});

	it('toggles one external server without disturbing its definition', async () => {
		const root = await workspace();
		const file = join(root, 'mcp-vertex.config.json');
		await writeFile(
			file,
			JSON.stringify({
				plugins: {
					'external-mcps': {
						options: {
							servers: {
								filesystem: {
									version: '1.2.3',
									command: 'npx',
									args: ['server@1.2.3'],
								},
							},
						},
					},
				},
			}),
		);
		await setPluginActivation({
			workspaceRoot: root,
			id: 'ext.filesystem',
			origin: 'external',
			active: false,
		});
		const value = JSON.parse(await readFile(file, 'utf8'));
		expect(
			value.plugins['external-mcps'].options.servers.filesystem,
		).toEqual({
			version: '1.2.3',
			command: 'npx',
			args: ['server@1.2.3'],
			enabled: false,
		});
	});

	it('is idempotent when the requested state already matches', async () => {
		const root = await workspace();
		const first = await setPluginActivation({
			workspaceRoot: root,
			id: 'git',
			origin: 'bundled',
			active: true,
		});
		const second = await setPluginActivation({
			workspaceRoot: root,
			id: 'git',
			origin: 'bundled',
			active: true,
		});
		expect(first.changed).toBe(true);
		expect(second.changed).toBe(false);
	});
});
