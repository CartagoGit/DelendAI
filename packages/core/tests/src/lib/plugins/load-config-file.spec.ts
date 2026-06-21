import { describe, expect, it } from 'vitest';

import {
	parseConfigFile,
	pluginConfigFor,
} from '@mcp-vertex/core/lib/plugins/load-config-file';
import {
	assembleCliConfig,
	runDoctor,
} from '@mcp-vertex/core/lib/cli/assemble';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';
import { diagnoseConfigFile } from '@mcp-vertex/core/lib/plugins/load-config-file';

describe('parseConfigFile', () => {
	it('returns {} for missing or invalid JSON', () => {
		expect(parseConfigFile(undefined)).toEqual({});
		expect(parseConfigFile('not json')).toEqual({});
		expect(parseConfigFile('[1,2]')).toEqual({});
	});

	it('reads per-plugin options and prefix', () => {
		const config = parseConfigFile(
			JSON.stringify({
				docsDir: 'docs/x',
				plugins: { proposals: { prefix: 'work', options: { a: 1 } } },
			}),
		);
		expect(config.docsDir).toBe('docs/x');
		expect(pluginConfigFor(config, 'proposals')).toEqual({
			prefix: 'work',
			options: { a: 1 },
		});
		expect(pluginConfigFor(config, 'missing')).toEqual({});
	});

	it('accepts keepLegacy as an optional global scaffold default', () => {
		const config = parseConfigFile(JSON.stringify({ keepLegacy: true }));
		expect(config.keepLegacy).toBe(true);
		expect(
			diagnoseConfigFile(JSON.stringify({ keepLegacy: true })).issues,
		).toEqual([]);
	});
});

describe('assembleCliConfig + config file', () => {
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
			['--plugins=demo', '--workspace=/ws'],
			'/cwd',
		);
		const { config } = await assembleCliConfig(args, {
			import: async () => ({ default: fakePlugin }),
			readFile: () =>
				JSON.stringify({
					plugins: { demo: { prefix: 'dd', options: { k: 'v' } } },
				}),
		});
		const known = config.knowledge?.find((entry) => entry.id === 'seen');
		expect(known?.title).toBe('dd');
		expect(JSON.parse(known?.body ?? '{}')).toEqual({
			options: { k: 'v' },
			keepLegacy: false,
		});
	});

	it('resolves keepLegacy false by default and propagates true to plugins and core scaffold', async () => {
		const missing = await assembleCliConfig(
			parseCliArgs(['--plugins=demo', '--workspace=/ws'], '/cwd'),
			{
				import: async () => ({ default: fakePlugin }),
				readFile: () => undefined,
			},
		);
		expect(missing.config.keepLegacy).toBe(false);

		const explicit = await assembleCliConfig(
			parseCliArgs(['--plugins=demo', '--workspace=/ws'], '/cwd'),
			{
				import: async () => ({ default: fakePlugin }),
				readFile: () => JSON.stringify({ keepLegacy: true }),
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
			['--plugins=demo', '--cacheDir=.cli', '--workspace=/ws'],
			'/cwd',
		);
		const { config } = await assembleCliConfig(args, {
			import: async () => ({ default: fakePlugin }),
			readFile: () => JSON.stringify({ cacheDir: '.fromfile' }),
		});
		expect(config.corePaths?.cacheDir).toBe('.cli');
	});

	it('falls back to the config file when the CLI omits the flag', async () => {
		const args = parseCliArgs(
			['--plugins=demo', '--workspace=/ws'],
			'/cwd',
		);
		const { config } = await assembleCliConfig(args, {
			import: async () => ({ default: fakePlugin }),
			readFile: () => JSON.stringify({ cacheDir: '.fromfile' }),
		});
		expect(config.corePaths?.cacheDir).toBe('.fromfile');
	});

	it('loads plugins declared only in the config file', async () => {
		const args = parseCliArgs(['--workspace=/ws'], '/cwd');
		const { config, loadResult } = await assembleCliConfig(args, {
			import: async () => ({ default: fakePlugin }),
			readFile: () =>
				JSON.stringify({
					plugins: { demo: { prefix: 'dd' } },
				}),
		});
		expect(loadResult.loaded.map((entry) => entry.plugin.name)).toEqual([
			'demo',
		]);
		const known = config.knowledge?.find((entry) => entry.id === 'seen');
		expect(known?.title).toBe('dd');
	});

	it('applies exclude-plugins to config-file plugins too', async () => {
		const args = parseCliArgs(
			['--workspace=/ws', '--exclude-plugins=demo'],
			'/cwd',
		);
		const { loadResult } = await assembleCliConfig(args, {
			import: async () => ({ default: fakePlugin }),
			readFile: () =>
				JSON.stringify({
					plugins: { demo: { prefix: 'dd' } },
				}),
		});
		expect(loadResult.loaded).toEqual([]);
	});
});

describe('diagnoseConfigFile', () => {
	it('reports no issues for a missing or valid file', () => {
		expect(diagnoseConfigFile(undefined)).toEqual({
			present: false,
			issues: [],
		});
		expect(
			diagnoseConfigFile(JSON.stringify({ cacheDir: '.x' })).issues,
		).toEqual([]);
	});
	it('reports invalid JSON and unknown keys', () => {
		expect(diagnoseConfigFile('nope').issues[0]).toMatch(/invalid JSON/);
		expect(
			diagnoseConfigFile(JSON.stringify({ bogus: 1 })).issues.length,
		).toBeGreaterThan(0);
	});
});

describe('runDoctor', () => {
	const demoPlugin = { name: 'demo', register: () => ({}) };
	it('reports loaded plugins, errors and counts without starting stdio', async () => {
		const args = parseCliArgs(
			['--plugins=demo,nope', '--workspace=/ws'],
			'/cwd',
		);
		const report = await runDoctor(args, {
			import: async (specifier: string) => {
				if (specifier.includes('demo')) return { default: demoPlugin };
				throw new Error('not found');
			},
			readFile: () => undefined,
		});
		expect(report.plugins.loaded).toEqual(['demo']);
		expect(report.plugins.errors.length).toBe(1);
		expect(report.ok).toBe(false);
		expect(report.counts.tools).toBeGreaterThan(0);
	});
});

describe('plugin optionsSchema validation', () => {
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
			['--plugins=strict', '--workspace=/ws'],
			'/cwd',
		);
		const { loadResult } = await assembleCliConfig(args, {
			import: async () => ({ default: strictPlugin }),
			readFile: () => undefined,
		});
		expect(loadResult.loaded).toEqual([]);
		expect(loadResult.errors[0]?.message).toMatch(/rejected its options/);
	});
});
