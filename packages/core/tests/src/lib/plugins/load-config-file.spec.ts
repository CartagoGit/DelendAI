import { describe, expect, it } from 'vitest';

import {
	parseConfigFile,
	pluginConfigFor,
} from '@mcp-vertex/core/lib/plugins/load-config-file';
import { assembleCliConfig, runDoctor } from '@mcp-vertex/core/lib/cli/assemble';
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
			})
		);
		expect(config.docsDir).toBe('docs/x');
		expect(pluginConfigFor(config, 'proposals')).toEqual({
			prefix: 'work',
			options: { a: 1 },
		});
		expect(pluginConfigFor(config, 'missing')).toEqual({});
	});
});

describe('assembleCliConfig + config file', () => {
	const fakePlugin = {
		name: 'demo',
		register: (ctx: { namespacePrefix: string; options: unknown }) => ({
			tools: [],
			knowledge: [
				{
					id: 'seen',
					title: ctx.namespacePrefix,
					body: JSON.stringify(ctx.options),
				},
			],
		}),
	};

	it('passes prefix + options from the config file to the plugin', async () => {
		const args = parseCliArgs(['--plugins=demo', '--workspace=/ws'], '/cwd');
		const { config } = await assembleCliConfig(args, {
			import: async () => ({ default: fakePlugin }),
			readFile: () =>
				JSON.stringify({
					plugins: { demo: { prefix: 'dd', options: { k: 'v' } } },
				}),
		});
		const known = config.knowledge?.find((entry) => entry.id === 'seen');
		expect(known?.title).toBe('dd');
		expect(known?.body).toBe(JSON.stringify({ k: 'v' }));
	});

	it('lets an explicit CLI flag win over the config file', async () => {
		const args = parseCliArgs(
			['--plugins=demo', '--cacheDir=.cli', '--workspace=/ws'],
			'/cwd'
		);
		const { config } = await assembleCliConfig(args, {
			import: async () => ({ default: fakePlugin }),
			readFile: () => JSON.stringify({ cacheDir: '.fromfile' }),
		});
		expect(config.corePaths?.cacheDir).toBe('.cli');
	});

	it('falls back to the config file when the CLI omits the flag', async () => {
		const args = parseCliArgs(['--plugins=demo', '--workspace=/ws'], '/cwd');
		const { config } = await assembleCliConfig(args, {
			import: async () => ({ default: fakePlugin }),
			readFile: () => JSON.stringify({ cacheDir: '.fromfile' }),
		});
		expect(config.corePaths?.cacheDir).toBe('.fromfile');
	});
});

describe('diagnoseConfigFile', () => {
	it('reports no issues for a missing or valid file', () => {
		expect(diagnoseConfigFile(undefined)).toEqual({
			present: false,
			issues: [],
		});
		expect(
			diagnoseConfigFile(JSON.stringify({ cacheDir: '.x' })).issues
		).toEqual([]);
	});
	it('reports invalid JSON and unknown keys', () => {
		expect(diagnoseConfigFile('nope').issues[0]).toMatch(/invalid JSON/);
		expect(
			diagnoseConfigFile(JSON.stringify({ bogus: 1 })).issues.length
		).toBeGreaterThan(0);
	});
});

describe('runDoctor', () => {
	const demoPlugin = { name: 'demo', register: () => ({}) };
	it('reports loaded plugins, errors and counts without starting stdio', async () => {
		const args = parseCliArgs(
			['--plugins=demo,nope', '--workspace=/ws'],
			'/cwd'
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
		const args = parseCliArgs(['--plugins=strict', '--workspace=/ws'], '/cwd');
		const { loadResult } = await assembleCliConfig(args, {
			import: async () => ({ default: strictPlugin }),
			readFile: () => undefined,
		});
		expect(loadResult.loaded).toEqual([]);
		expect(loadResult.errors[0]?.message).toMatch(/rejected its options/);
	});
});
