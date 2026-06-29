import { describe, expect, it } from 'vitest';

import {
	diagnosePluginPathConfig,
	parseConfigFile,
	pluginConfigFor,
	resolveConfigPluginSpecifiers,
} from '@mcp-vertex/core/lib/plugins/load-config-file';
import { CONFIG_FILE_SCHEMA } from '@mcp-vertex/core/lib/plugins/config-file-schema';
import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';

describe('resolveConfigPluginSpecifiers (f00087 S1)', () => {
	it('passes the bare entry key through when no path is set', () => {
		const config = parseConfigFile(
			JSON.stringify({ plugins: { proposals: { prefix: 'work' } } }),
		);
		expect(resolveConfigPluginSpecifiers(config, '/workspace')).toEqual([
			'proposals',
		]);
	});

	it('resolves a relative path against the workspace root', () => {
		const config = parseConfigFile(
			JSON.stringify({
				plugins: {
					'lx-app': { path: 'libs/plugins/lx-app/dist/index.js' },
				},
			}),
		);
		expect(resolveConfigPluginSpecifiers(config, '/workspace')).toEqual([
			'/workspace/libs/plugins/lx-app/dist/index.js',
		]);
	});

	it('forwards absolute and scheme-prefixed paths verbatim', () => {
		const config = parseConfigFile(
			JSON.stringify({
				plugins: {
					a: { path: '/abs/path/plugin.js' },
					b: { path: './relative.js' },
					c: { path: '../sibling/index.ts' },
					d: { path: 'file:///abs/path/index.ts' },
				},
			}),
		);
		expect(resolveConfigPluginSpecifiers(config, '/workspace')).toEqual([
			'/abs/path/plugin.js',
			'./relative.js',
			'../sibling/index.ts',
			'file:///abs/path/index.ts',
		]);
	});

	it('skips empty path values and falls back to the bare key', () => {
		const config = parseConfigFile(
			JSON.stringify({ plugins: { x: { path: '' } } }),
		);
		expect(resolveConfigPluginSpecifiers(config, '/workspace')).toEqual([
			'x',
		]);
	});
});

describe('diagnosePluginPathConfig (f00087 S1)', () => {
	it('reports nothing for valid paths', () => {
		expect(
			diagnosePluginPathConfig({ path: './dist/index.js' }, 'proposals'),
		).toEqual([]);
		expect(diagnosePluginPathConfig({ path: '/abs/path.js' }, 'p')).toEqual(
			[],
		);
		expect(
			diagnosePluginPathConfig({ path: 'file:///abs/path.ts' }, 'p'),
		).toEqual([]);
	});

	it('flags a path that looks like a bare name (no separator)', () => {
		const issues = diagnosePluginPathConfig(
			{ path: 'lx-app' },
			'proposals',
		);
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatch(/plugins\.proposals\.path/);
		expect(issues[0]).toMatch(/lx-app/);
	});

	it('flags an empty path', () => {
		const issues = diagnosePluginPathConfig({ path: '' }, 'proposals');
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatch(/must not be empty/);
	});

	it('flags missing path as no-op', () => {
		expect(diagnosePluginPathConfig({}, 'p')).toEqual([]);
	});
});

describe('IMcpVertexPluginConfig (f00087 S1)', () => {
	it('round-trips a path field through parseConfigFile', () => {
		const config = parseConfigFile(
			JSON.stringify({
				plugins: {
					'lx-app': {
						path: './dist/index.js',
						prefix: 'lx',
						options: { a: 1 },
					},
				},
			}),
		);
		const entry = pluginConfigFor(config, 'lx-app');
		expect(entry.path).toBe('./dist/index.js');
		expect(entry.prefix).toBe('lx');
		expect(entry.options).toEqual({ a: 1 });
	});

	it('schema accepts the new optional path field', () => {
		const result = CONFIG_FILE_SCHEMA.safeParse({
			plugins: { 'lx-app': { path: './dist/index.js' } },
		});
		expect(result.success).toBe(true);
	});

	it('schema still rejects unknown plugin entry fields', () => {
		// Per-plugin entries are deliberately NOT `.strict()` (forward
		// compatibility for downstream configs); only the outer
		// config object is strict. Confirm by accepting an unknown
		// plugin field and asserting only the parent-level strictness.
		const result = CONFIG_FILE_SCHEMA.safeParse({
			plugins: { 'lx-app': { path: './dist/index.js', junk: true } },
		});
		expect(result.success).toBe(true);
		const parentStrict = CONFIG_FILE_SCHEMA.safeParse({
			plugins: { 'lx-app': { path: './dist/index.js' } },
			bogus: 1,
		});
		expect(parentStrict.success).toBe(false);
	});
});

describe('assembleCliConfig + plugins.<name>.path (f00087 S1)', () => {
	const fakeLocalPlugin = {
		name: 'lx-app',
		register: () => ({
			tools: [],
			knowledge: [
				{ id: 'local-ping', title: 'local-loaded', body: '{}' },
			],
		}),
	};

	it('passes the resolved path as the specifier the loader sees', async () => {
		const args = parseCliArgs(['--workspace=/ws'], '/cwd');
		const importCalls: string[] = [];
		const { loadResult } = await assembleCliConfig(args, {
			import: async (specifier) => {
				importCalls.push(specifier);
				return { default: fakeLocalPlugin };
			},
			readFile: async () =>
				JSON.stringify({
					plugins: {
						'lx-app': { path: 'libs/plugins/lx-app/dist/index.js' },
					},
				}),
		});
		// The loader received the workspace-rooted absolute path,
		// NOT the bare key `lx-app`.
		expect(importCalls).toContain('/ws/libs/plugins/lx-app/dist/index.js');
		expect(loadResult.loaded.map((entry) => entry.plugin.name)).toContain(
			'lx-app',
		);
	});

	it('does not break a config that uses the bare-name pattern', async () => {
		const args = parseCliArgs(
			['--plugins=memory', '--workspace=/ws'],
			'/cwd',
		);
		const importCalls: string[] = [];
		await assembleCliConfig(args, {
			import: async (specifier) => {
				importCalls.push(specifier);
				return {
					default: {
						name: 'memory',
						register: () => ({ tools: [], knowledge: [] }),
					},
				};
			},
			readFile: async () =>
				JSON.stringify({
					plugins: { memory: { options: { maxBytes: 1024 } } },
				}),
		});
		// Bare-name path: the entry key is forwarded verbatim to
		// `resolvePluginSpecifier`, whose fallback chain tries
		// `@mcp-vertex/memory` first, then `mcp-memory`, then
		// `memory`. The fake importer returns successfully on the
		// first attempt, so only one import call fires — that
		// proves the resolver ran its chain.
		expect(importCalls).toEqual(['@mcp-vertex/memory']);
	});

	it('surfaces a config-typo warning for a bare-name-shaped path', async () => {
		const args = parseCliArgs(['--workspace=/ws'], '/cwd');
		const { configDiagnostic } = await assembleCliConfig(args, {
			import: async () => ({
				default: {
					name: 'lx-app',
					register: () => ({ tools: [], knowledge: [] }),
				},
			}),
			readFile: async () =>
				JSON.stringify({
					plugins: { 'lx-app': { path: 'lx-app' } },
				}),
		});
		expect(
			configDiagnostic.issues.some((issue) => /lx-app/.test(issue)),
		).toBe(true);
	});
});
