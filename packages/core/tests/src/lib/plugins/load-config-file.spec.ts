import { afterAll, describe, expect, it } from 'vitest';
import {
	parseConfigFile,
	pluginConfigFor,
} from '@delendai/core/lib/plugins/load-config-file';
import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { runDoctor } from '@delendai/core/lib/cli/run-cli';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';
import { diagnoseConfigFile } from '@delendai/core/lib/plugins/load-config-file';

import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

const WRITABLE_WORKSPACE = createTestWorkspace('mcp-vertex-config-');
const CLI_CACHE_DIR = '.cli';
const FILE_CACHE_DIR = '.fromfile';
afterAll(() => removeTestWorkspace(WRITABLE_WORKSPACE));

describe('parseConfigFile', async () => {
	it('returns {} for missing or invalid JSON', async () => {
		expect(parseConfigFile(undefined)).toEqual({});
		expect(parseConfigFile('not json')).toEqual({});
		expect(parseConfigFile('[1,2]')).toEqual({});
	});

	it('reads per-plugin activation, options and prefix', async () => {
		const config = parseConfigFile(
			JSON.stringify({
				docsDir: 'docs/x',
				plugins: {
					proposals: {
						enabled: false,
						prefix: 'work',
						options: { a: 1 },
					},
				},
			}),
		);
		expect(config.docsDir).toBe('docs/x');
		expect(pluginConfigFor(config, 'proposals')).toEqual({
			enabled: false,
			prefix: 'work',
			options: { a: 1 },
		});
		expect(pluginConfigFor(config, 'missing')).toEqual({});
	});

	it('accepts keepLegacy as an optional global scaffold default', async () => {
		const config = parseConfigFile(JSON.stringify({ keepLegacy: true }));
		expect(config.keepLegacy).toBe(true);
		expect(
			diagnoseConfigFile(JSON.stringify({ keepLegacy: true })).issues,
		).toEqual([]);
	});
});

describe('assembleCliConfig + config file', async () => {
	const fakePlugin = {
		name: 'demo',
		register: (ctx: {
			namespacePrefix: string;
			options: unknown;
			keepLegacy: boolean;
		}) => ({
			tools: [],
			knowledge: [
				{
					id: 'seen',
					title: ctx.namespacePrefix,
					body: JSON.stringify({
						options: ctx.options,
						keepLegacy: ctx.keepLegacy,
					}),
				},
			],
		}),
	};

	it('passes prefix + options from the config file to the plugin', async () => {
		const args = parseCliArgs(
			[
				'--plugins=demo',
				`--workspace=${WRITABLE_WORKSPACE}`,
				'--surface=native',
			],
			WRITABLE_WORKSPACE,
		);
		const { config } = await assembleCliConfig(args, {
			import: async () => ({ default: fakePlugin }),
			readFile: async () =>
				JSON.stringify({
					plugins: { demo: { prefix: 'dd', options: { k: 'v' } } },
				}),
		});
		const known = config.knowledge?.find((entry) => entry.id === 'seen');
		// After the host-namespace rename a plugin's ctx.namespacePrefix is
		// host-qualified (`mcp-vertex_<prefix>`) so tools register as
		// `mcp-vertex_<plugin>_<tool>`; the fake plugin echoes it as the title.
		expect(known?.title).toBe('mcp-vertex_dd');
		expect(JSON.parse(known?.body ?? '{}')).toEqual({
			options: { k: 'v' },
			keepLegacy: false,
		});
	});

	it('an enabled:false config override suppresses a preset plugin', async () => {
		const args = parseCliArgs(
			[
				'--preset=minimal',
				`--workspace=${WRITABLE_WORKSPACE}`,
				'--surface=native',
			],
			WRITABLE_WORKSPACE,
		);
		const attempted: string[] = [];
		const { loadResult } = await assembleCliConfig(args, {
			import: async (specifier) => {
				attempted.push(specifier);
				return {
					default: {
						name: specifier.split('/').at(-1) ?? specifier,
						register: () => ({ tools: [] }),
					},
				};
			},
			readFile: async (absolutePath) =>
				absolutePath.endsWith('mcp-vertex.config.json')
					? JSON.stringify({ plugins: { git: { enabled: false } } })
					: undefined,
		});

		expect(loadResult.loaded.map((entry) => entry.plugin.name)).toEqual([
			'search',
		]);
		expect(attempted).not.toContain('@delendai/git');
	});

	it('resolves keepLegacy false by default and propagates true to plugins and core scaffold', async () => {
		const missing = await assembleCliConfig(
			parseCliArgs(
				[
					'--plugins=demo',
					`--workspace=${WRITABLE_WORKSPACE}`,
					'--surface=native',
				],
				WRITABLE_WORKSPACE,
			),
			{
				import: async () => ({ default: fakePlugin }),
				readFile: async () => undefined,
			},
		);
		expect(missing.config.keepLegacy).toBe(false);

		const explicit = await assembleCliConfig(
			parseCliArgs(
				[
					'--plugins=demo',
					`--workspace=${WRITABLE_WORKSPACE}`,
					'--surface=native',
				],
				WRITABLE_WORKSPACE,
			),
			{
				import: async () => ({ default: fakePlugin }),
				readFile: async () => JSON.stringify({ keepLegacy: true }),
			},
		);
		expect(explicit.config.keepLegacy).toBe(true);
		const known = explicit.config.knowledge?.find(
			(entry) => entry.id === 'seen',
		);
		expect(JSON.parse(known?.body ?? '{}').keepLegacy).toBe(true);
	});

	it('lets an explicit CLI flag win over the config file', async () => {
		const args = parseCliArgs(
			[
				'--plugins=demo',
				`--cacheDir=${CLI_CACHE_DIR}`,
				`--workspace=${WRITABLE_WORKSPACE}`,
				'--surface=native',
			],
			WRITABLE_WORKSPACE,
		);
		const { config } = await assembleCliConfig(args, {
			import: async () => ({ default: fakePlugin }),
			readFile: async () => JSON.stringify({ cacheDir: FILE_CACHE_DIR }),
		});
		expect(config.corePaths?.cacheDir).toBe(CLI_CACHE_DIR);
	});

	it('falls back to the config file when the CLI omits the flag', async () => {
		const args = parseCliArgs(
			[
				'--plugins=demo',
				`--workspace=${WRITABLE_WORKSPACE}`,
				'--surface=native',
			],
			WRITABLE_WORKSPACE,
		);
		const { config } = await assembleCliConfig(args, {
			import: async () => ({ default: fakePlugin }),
			readFile: async () => JSON.stringify({ cacheDir: FILE_CACHE_DIR }),
		});
		expect(config.corePaths?.cacheDir).toBe(FILE_CACHE_DIR);
	});

	it('loads plugins declared only in the config file', async () => {
		const args = parseCliArgs(
			[`--workspace=${WRITABLE_WORKSPACE}`, '--surface=native'],
			WRITABLE_WORKSPACE,
		);
		const { config, loadResult } = await assembleCliConfig(args, {
			import: async () => ({ default: fakePlugin }),
			readFile: async () =>
				JSON.stringify({
					plugins: { demo: { prefix: 'dd' } },
				}),
		});
		expect(loadResult.loaded.map((entry) => entry.plugin.name)).toEqual([
			'demo',
		]);
		const known = config.knowledge?.find((entry) => entry.id === 'seen');
		// After the host-namespace rename a plugin's ctx.namespacePrefix is
		// host-qualified (`mcp-vertex_<prefix>`) so tools register as
		// `mcp-vertex_<plugin>_<tool>`; the fake plugin echoes it as the title.
		expect(known?.title).toBe('mcp-vertex_dd');
	});

	it('applies exclude-plugins to config-file plugins too', async () => {
		const args = parseCliArgs(
			[
				`--workspace=${WRITABLE_WORKSPACE}`,
				'--surface=native',
				'--exclude-plugins=demo',
			],
			WRITABLE_WORKSPACE,
		);
		const { loadResult } = await assembleCliConfig(args, {
			import: async () => ({ default: fakePlugin }),
			readFile: async () =>
				JSON.stringify({
					plugins: { demo: { prefix: 'dd' } },
				}),
		});
		expect(loadResult.loaded).toEqual([]);
	});
});

describe('diagnoseConfigFile', async () => {
	it('reports no issues for a missing or valid file', async () => {
		expect(diagnoseConfigFile(undefined)).toEqual({
			present: false,
			issues: [],
		});
		expect(
			diagnoseConfigFile(JSON.stringify({ cacheDir: '.x' })).issues,
		).toEqual([]);
	});
	it('reports invalid JSON and unknown keys', async () => {
		expect(diagnoseConfigFile('nope').issues[0]).toMatch(/invalid JSON/);
		expect(
			diagnoseConfigFile(JSON.stringify({ bogus: 1 })).issues.length,
		).toBeGreaterThan(0);
	});
});

describe('runDoctor', async () => {
	const demoPlugin = { name: 'demo', register: () => ({}) };
	it('reports loaded plugins, errors and counts without starting stdio', async () => {
		const args = parseCliArgs(
			[
				'--plugins=demo,nope',
				`--workspace=${WRITABLE_WORKSPACE}`,
				'--surface=native',
			],
			WRITABLE_WORKSPACE,
		);
		const report = await runDoctor(args, {
			import: async (specifier: string) => {
				if (specifier.includes('demo')) return { default: demoPlugin };
				throw new Error('not found');
			},
			readFile: async () => undefined,
		});
		expect(report.plugins.loaded).toEqual(['demo']);
		expect(report.plugins.errors.length).toBe(1);
		expect(report.ok).toBe(false);
		expect(report.counts.tools).toBeGreaterThan(0);
	});
});

describe('plugin optionsSchema validation', async () => {
	const strictPlugin = {
		name: 'strict',
		optionsSchema: {
			safeParse: (value: unknown) => ({
				success:
					typeof value === 'object' &&
					value !== null &&
					'required' in value,
			}),
		},
		register: () => ({}),
	};

	it('rejects a plugin whose options fail its schema', async () => {
		const args = parseCliArgs(
			[
				'--plugins=strict',
				`--workspace=${WRITABLE_WORKSPACE}`,
				'--surface=native',
			],
			WRITABLE_WORKSPACE,
		);
		const { loadResult } = await assembleCliConfig(args, {
			import: async () => ({ default: strictPlugin }),
			readFile: async () => undefined,
		});
		expect(loadResult.loaded).toEqual([]);
		expect(loadResult.errors[0]?.message).toMatch(/rejected its options/);
	});
});
