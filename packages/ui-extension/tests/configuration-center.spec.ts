import { describe, expect, it } from 'vitest';

import type { IConfigurationCenterSource } from '../src/contracts/interfaces/configuration-center.interface';
import { buildConfigurationCenterModel } from '../src/configuration-center/configuration-center-model';
import { renderConfigurationCenter } from '../src/configuration-center/render-configuration-center';

const source = (): IConfigurationCenterSource => ({
	document: {
		configFile: '/workspace/delendai.config.json',
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
			optionalText: { type: 'string' },
			defaultText: { type: 'string', default: 'safe-default' },
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
			optionsSchema: {
				type: 'object',
				properties: {
					enabled: { type: 'boolean' },
					command: { type: 'string' },
					args: { type: 'array', items: { type: 'string' } },
				},
			},
			schemaStatus: 'available',
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
		{
			id: 'project-resource',
			kind: 'resource',
			owner: { id: 'local-plugin', origin: 'user-local' },
		},
		{
			id: 'project-guide',
			kind: 'knowledge',
			owner: { id: 'local-plugin', origin: 'user-local' },
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
			'resources',
			'knowledge',
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
		expect(model.artifacts.resources[0]).toMatchObject({
			id: 'project-resource',
			ownerLabel: 'local-plugin',
		});
		expect(model.artifacts.knowledge[0]).toMatchObject({
			id: 'project-guide',
			ownerLabel: 'local-plugin',
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
		expect(
			model.generalFields.find((field) => field.label === 'optionalText'),
		).toMatchObject({ value: undefined, readOnly: false });
		expect(
			model.generalFields.find((field) => field.label === 'defaultText'),
		).toMatchObject({ value: 'safe-default', readOnly: false });
		const external = model.plugins.find((plugin) =>
			plugin.id.startsWith('ext.'),
		)!;
		expect(
			external.fields.find((field) => field.path.at(-1) === 'enabled'),
		).toMatchObject({
			path: [
				'plugins',
				'external-mcps',
				'options',
				'servers',
				'<opaque-plugin>',
				'enabled',
			],
			kind: 'boolean',
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
		expect(html).toContain('height: 100vh');
		expect(html).toContain('grid-template-rows: auto minmax(0, 1fr) auto');
		expect(html).toContain("event.key !== 'ArrowDown'");
		expect(html).toContain('delendai-configuration-message');
		expect(html).toContain('config-panel-resources');
		expect(html).toContain('config-panel-knowledge');
		expect(html).not.toContain('acquireVsCodeApi');
	});

	it('escapes plugin ids and retains opaque options in a raw JSON field', () => {
		const html = renderConfigurationCenter({
			model: buildConfigurationCenterModel(source()),
		});

		expect(html).toContain('ext.&lt;opaque-plugin&gt;');
		expect(html).not.toContain('ext.<opaque-plugin>');
		expect(html).toContain('field-plugins-external-mcps-options-servers');
		expect(html).toContain('&quot;command&quot;]');
		expect(html).not.toContain('Server definition');
		expect(html).toContain(
			'[&quot;plugins&quot;,&quot;external-mcps&quot;,&quot;options&quot;,&quot;servers&quot;,&quot;&lt;opaque-plugin&gt;&quot;,&quot;enabled&quot;]',
		);
	});
});
