import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { setPluginActivation } from '../lib/services/plugin-activation.service';

const roots: string[] = [];
const workspace = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'delendai-activation-'));
	roots.push(root);
	return root;
};

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true })),
	);
});

describe('setPluginActivation', () => {
	it('creates a new config only when the file is absent', async () => {
		const root = await workspace();
		const file = join(root, 'delendai.config.json');

		const result = await setPluginActivation({
			workspaceRoot: root,
			id: 'git',
			origin: 'bundled',
			active: true,
		});

		expect(result.changed).toBe(true);
		expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
			plugins: { git: { enabled: true, origin: 'bundled' } },
		});
	});

	it('merges a native enabled override without losing its path/options', async () => {
		const root = await workspace();
		const file = join(root, 'delendai.config.json');
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
		const file = join(root, 'delendai.config.json');
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

	it('fails closed on corrupt JSON and preserves the original bytes', async () => {
		const root = await workspace();
		const file = join(root, 'delendai.config.json');
		const original = '{\n\t"plugins": { "git": true }\n';
		await writeFile(file, original);

		await expect(
			setPluginActivation({
				workspaceRoot: root,
				id: 'git',
				origin: 'bundled',
				active: false,
			}),
		).rejects.toThrow('Invalid JSON in config file');
		expect(await readFile(file, 'utf8')).toBe(original);
	});

	it('fails closed on read errors and preserves the original bytes', async () => {
		const root = await workspace();
		const file = join(root, 'delendai.config.json');
		const original = '{"plugins":{"git":{"enabled":true}}}\n';
		await writeFile(file, original);
		await chmod(file, 0o000);

		try {
			await expect(
				setPluginActivation({
					workspaceRoot: root,
					id: 'git',
					origin: 'bundled',
					active: false,
				}),
			).rejects.toThrow('Unable to read config file');
		} finally {
			await chmod(file, 0o600);
		}

		expect(await readFile(file, 'utf8')).toBe(original);
	});

	// a00084 F32: `configFileName` used to be `join()`-ed onto workspaceRoot
	// with no containment check. Not reachable from the VS Code UI today,
	// but the service API accepts it, so a `..` traversal must still fail
	// closed instead of writing outside the workspace.
	it('rejects a configFileName that escapes the workspace root', async () => {
		const root = await workspace();

		await expect(
			setPluginActivation({
				workspaceRoot: root,
				id: 'git',
				origin: 'bundled',
				active: true,
				configFileName: '../../escaped.config.json',
			}),
		).rejects.toThrow('configFileName is not contained in the workspace');
	});

	it('rejects an absolute configFileName', async () => {
		const root = await workspace();

		await expect(
			setPluginActivation({
				workspaceRoot: root,
				id: 'git',
				origin: 'bundled',
				active: true,
				configFileName: '/etc/delendai-escaped.config.json',
			}),
		).rejects.toThrow('configFileName is not contained in the workspace');
	});
});
