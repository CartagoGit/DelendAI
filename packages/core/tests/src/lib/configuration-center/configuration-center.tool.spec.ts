import { afterAll, describe, expect, it } from 'vitest';
import z from 'zod';

import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import type { IToolRegistration } from '@mcp-vertex/core/lib/contracts/interfaces/tool-registration.interface';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';
import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

const WRITABLE_WORKSPACE = createTestWorkspace('mcp-vertex-config-tool-');
afterAll(() => removeTestWorkspace(WRITABLE_WORKSPACE));

const callTool = async (
	tool: IToolRegistration,
	args: unknown = {},
): Promise<Record<string, any>> => {
	let handler: (value: unknown) => Promise<{
		content: Array<{ text: string }>;
	}>;
	await tool.register({
		registerTool: (
			_name: string,
			definition: any,
			next: typeof handler,
		) => {
			expect(definition.outputSchema).toBeDefined();
			handler = next;
		},
	} as never);
	const result = await handler!(args);
	return JSON.parse(result.content[0]?.text ?? '{}');
};

describe('configuration_center tool', () => {
	it('keeps summary lean and lazily exposes redacted config, schemas and provenance', async () => {
		const configText = JSON.stringify({
			plugins: {
				demo: {
					path: './demo.js',
					prefix: 'custom',
					options: { token: 'sk-123456789012345678901234' },
				},
			},
		});
		const args = parseCliArgs(
			[`--workspace=${WRITABLE_WORKSPACE}`, '--surface=native'],
			WRITABLE_WORKSPACE,
		);
		const { config } = await assembleCliConfig(args, {
			readFile: async (path) =>
				path.endsWith('mcp-vertex.config.json')
					? configText
					: undefined,
			import: async () => ({
				default: {
					name: 'demo',
					optionsSchema: z.object({ token: z.string() }),
					configExample: {
						summary: 'Demo',
						options: { token: 'from-env' },
					},
					register: () => ({
						tools: [{ id: 'run', register: async () => {} }],
						prompts: [
							{ id: 'demo-prompt', register: async () => {} },
						],
						resources: [
							{ id: 'demo-resource', register: async () => {} },
						],
						knowledge: [
							{ id: 'demo-guide', title: 'Guide', body: 'Body' },
						],
					}),
				},
			}),
		});
		const tool = config.extraTools?.find(
			(entry) => entry.id === 'configuration_center',
		);
		expect(tool).toBeDefined();

		const summary = await callTool(tool!);
		expect(summary).toMatchObject({
			section: 'summary',
			summary: {
				plugins: 1,
				activePlugins: 1,
				// Native compatibility assembly also registers the core
				// artifacts; the demo plugin contributes the three fixture
				// artifacts on top of that canonical set.
				artifacts: 11,
				unavailableArtifactKinds: ['agent'],
			},
		});
		expect(summary.config).toBeUndefined();
		expect(summary.plugins).toBeUndefined();

		const configSection = await callTool(tool!, { section: 'config' });
		expect(configSection.redactions).toBe(2);
		expect(configSection.config.plugins.demo.options.token).toBe(
			'[REDACTED]',
		);
		expect(configSection.configSchema.properties.plugins).toBeDefined();

		const plugins = await callTool(tool!, {
			section: 'plugins',
			limit: 1,
		});
		expect(plugins.plugins[0]).toMatchObject({
			id: 'demo',
			origin: 'user-local',
			active: true,
			source: 'config',
			path: './demo.js',
			prefix: 'custom',
			schemaStatus: 'available',
			capabilities: {
				tools: 1,
				prompts: 1,
				resources: 1,
				knowledge: 1,
				skills: 0,
			},
		});
		expect(plugins.plugins[0].optionsSchema.properties.token).toBeDefined();
		expect(plugins.plugins[0].options.token).toBe('[REDACTED]');

		const artifacts = await callTool(tool!, {
			section: 'artifacts',
			limit: 2,
		});
		expect(artifacts.artifacts).toHaveLength(2);
		expect(artifacts.page).toMatchObject({ total: 11, nextCursor: 2 });
		expect(
			artifacts.artifacts.every(
				(entry: any) =>
					entry.owner.id === 'demo' &&
					entry.owner.origin === 'user-local',
			),
		).toBe(true);
	});
});
