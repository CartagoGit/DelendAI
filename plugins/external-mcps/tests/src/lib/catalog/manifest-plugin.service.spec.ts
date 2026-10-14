/**
 * manifest-plugin.service.spec.ts — an MCP server with a
 * `delendai.plugin.json` beside it is judged by that manifest.
 */
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { manifestPluginOf } from '../../../../src/lib/catalog/manifest-plugin.service';

const ROOT = resolve('/workspace');
const MANIFEST = join(ROOT, 'tools', 'delendai.plugin.json');

const manifest = (over: Record<string, unknown> = {}): string =>
	JSON.stringify({
		id: 'weather',
		package: '@acme/weather-mcp',
		version: '0.1.0',
		visibility: 'public',
		summary: 'Reports the weather for a city.',
		tags: ['weather'],
		maturity: 'experimental',
		permissions: ['network'],
		presets: [],
		tokenBudget: 400,
		dependencies: [],
		capabilities: [],
		...over,
	});

const judge = (
	files: Readonly<Record<string, string>>,
	env?: readonly string[],
) =>
	manifestPluginOf({
		workspaceRoot: ROOT,
		entry: {
			command: 'python3',
			args: ['tools/server.py'],
			...(env === undefined ? {} : { env }),
		},
		read: (path) => files[path],
	});

describe('manifestPluginOf', () => {
	it('finds no plugin when nothing is beside the server', () => {
		expect(judge({})).toEqual({ kind: 'none' });
		expect(
			manifestPluginOf({
				workspaceRoot: ROOT,
				entry: { command: 'npx', args: ['some-mcp'] },
				read: () => manifest(),
			}),
		).toEqual({ kind: 'none' });
	});

	it('takes a valid manifest beside the script as the plugin', () => {
		const plugin = judge({ [MANIFEST]: manifest() });
		expect(plugin.kind).toBe('plugin');
		expect(plugin.kind === 'plugin' && plugin.manifest.id).toBe('weather');
	});

	it('refuses an invalid manifest with the schema path of each problem', () => {
		const plugin = judge({
			[MANIFEST]: manifest({ tags: [], id: 'Not Kebab' }),
		});
		expect(plugin.kind).toBe('refused');
		const reason = plugin.kind === 'refused' ? plugin.reason : '';
		expect(reason).toContain('id: id must be kebab-case');
		expect(reason).toContain('tags: tags must not be empty');
	});

	it('refuses a manifest that is not JSON', () => {
		const plugin = judge({ [MANIFEST]: '{ nope' });
		expect(plugin.kind === 'refused' && plugin.reason).toContain(
			'is not a valid plugin manifest',
		);
	});

	it('refuses host env the manifest does not grant, and allows it when granted', () => {
		const denied = judge({ [MANIFEST]: manifest() }, ['WEATHER_TOKEN']);
		expect(denied.kind === 'refused' && denied.reason).toContain(
			'grants neither env-read nor secrets',
		);
		const granted = judge(
			{ [MANIFEST]: manifest({ permissions: ['network', 'secrets'] }) },
			['WEATHER_TOKEN'],
		);
		expect(granted.kind).toBe('plugin');
		const asMap = manifestPluginOf({
			workspaceRoot: ROOT,
			entry: {
				command: 'python3',
				args: ['tools/server.py'],
				env: { WEATHER_TOKEN: '$WEATHER_TOKEN' },
			},
			read: (path) => (path === MANIFEST ? manifest() : undefined),
		});
		expect(asMap.kind === 'refused' && asMap.reason).toContain(
			'WEATHER_TOKEN',
		);
	});
});
