import { describe, expect, it } from 'vitest';

import type { IConfigurationCenterSource } from '../src/contracts/interfaces/configuration-center.interface';
import { buildConfigurationCenterModel } from '../src/configuration-center/configuration-center-model';
import { renderConfigurationCenter } from '../src/configuration-center/render-configuration-center';

const source = (): IConfigurationCenterSource => ({
	document: {
		configFile: '/workspace/mcp-vertex.config.json',
		exists: true,
		digest: 'digest-1',
		redactions: 1,
		value: {
			keepLegacy: true,
			futureRoot: { retained: true },
			hiddenRoot: { token: '[REDACTED]' },
			plugins: {
				'external-mcps': {
					options: {
						servers: {
							'<opaque-plugin>': {
								command: 'bunx',
								args: ['opaque-server'],
								enabled: true,
							},
						},
					},
				},
			},
			providers: [
				{
					id: 'codex',
					kind: 'subscription',
					modelId: 'gpt-5',
				},
			],
		},
	},
	configSchema: {
		type: 'object',
		properties: {
			keepLegacy: {
				type: 'boolean',
				description: 'Keep legacy proposal folders.',
			},
			plugins: { type: 'object' },
			providers: { type: 'array' },
		},
	},
	plugins: [
		{
			id: 'local-plugin',
			origin: 'user-local',
			active: false,
			source: 'config',
			path: './plugin.ts',
			options: { mode: 'safe', futureOption: { keep: true } },
			optionsSchema: {
				type: 'object',
				properties: {
					mode: { type: 'string', enum: ['safe', 'fast'] },
				},
			},
			schemaStatus: 'available',
			capabilities: {
				tools: 2,
				prompts: 1,
				resources: 0,
				knowledge: 0,
				skills: 1,
			},
		},
		{
			id: 'ext.<opaque-plugin>',
			origin: 'external',
			active: true,
			source: 'flag',
			options: { endpoint: 'https://example.test' },
			schemaStatus: 'unavailable',
			capabilities: {
				tools: 1,
				prompts: 0,
				resources: 0,
				knowledge: 0,
				skills: 0,
			},
		},
	],
	artifacts: [
		{
			id: 'review-code',
			kind: 'prompt',
			owner: { id: 'local-plugin', origin: 'user-local' },
		},
		{
			id: 'audit-skill',
			kind: 'skill',
			owner: { id: 'audit', origin: 'bundled' },
		},
	],
	unavailableArtifactKinds: ['agent'],
});

describe('Configuration Center model', () => {
	it('builds all navigation groups, provider rows and explicit unavailable state', () => {
		const model = buildConfigurationCenterModel(source());

		expect(model.tabs.map((tab) => tab.id)).toEqual([
			'general',
			'plugins',
			'providers',
			'agents',
			'skills',
			'prompts',
		]);
		expect(model.tabs.find((tab) => tab.id === 'agents')).toMatchObject({
			count: 0,
			unavailable: true,
		});
		expect(model.providers[0]).toMatchObject({
			id: 'codex',
			kind: 'subscription',
			modelId: 'gpt-5',
		});
	});

	it('derives known controls from schemas and preserves unknown fields as JSON', () => {
		const model = buildConfigurationCenterModel(source());
		const local = model.plugins.find(
			(plugin) => plugin.id === 'local-plugin',
		)!;

		expect(local.fields).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: 'mode',
					kind: 'select',
					known: true,
				}),
				expect.objectContaining({
					label: 'futureOption',
					kind: 'json',
					known: false,
				}),
			]),
		);
		expect(model.generalFields).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: 'keepLegacy',
					kind: 'boolean',
				}),
				expect.objectContaining({ label: 'futureRoot', known: false }),
			]),
		);
		expect(
			model.generalFields.find((field) => field.label === 'hiddenRoot'),
		).toMatchObject({ readOnly: true });
		const external = model.plugins.find((plugin) =>
			plugin.id.startsWith('ext.'),
		)!;
		expect(external.fields[0]).toMatchObject({
			path: [
				'plugins',
				'external-mcps',
				'options',
				'servers',
				'<opaque-plugin>',
			],
			kind: 'json',
		});
	});
});

describe('renderConfigurationCenter', () => {
	it('renders an accessible, host-neutral and responsive editor shell', () => {
		const html = renderConfigurationCenter({
			model: buildConfigurationCenterModel(source()),
			nonce: 'test-nonce',
		});

		expect(html).toContain('role="tablist"');
		expect(html).toContain('role="tabpanel"');
		expect(html).toContain('data-config-save');
		expect(html).toContain('saveConfiguration');
		expect(html).toContain('configurationConflict');
		expect(html).toContain('prefers-reduced-motion');
		expect(html).toContain("event.key !== 'ArrowDown'");
		expect(html).toContain('mcpv-configuration-message');
		expect(html).not.toContain('acquireVsCodeApi');
	});

	it('escapes plugin ids and retains opaque options in a raw JSON field', () => {
		const html = renderConfigurationCenter({
			model: buildConfigurationCenterModel(source()),
		});

		expect(html).toContain('ext.&lt;opaque-plugin&gt;');
		expect(html).not.toContain('ext.<opaque-plugin>');
		expect(html).toContain('No editable schema advertised');
		expect(html).toContain('&quot;command&quot;');
		expect(html).toContain(
			'[&quot;plugins&quot;,&quot;external-mcps&quot;,&quot;options&quot;,&quot;servers&quot;,&quot;&lt;opaque-plugin&gt;&quot;,&quot;enabled&quot;]',
		);
	});
});
