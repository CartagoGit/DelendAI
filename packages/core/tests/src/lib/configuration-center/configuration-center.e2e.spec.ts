import { afterAll, describe, expect, it } from 'vitest';
import z from 'zod';

import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import type { IToolRegistration } from '@mcp-vertex/core/lib/contracts/interfaces/tool-registration.interface';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';

import externalMcps from '../../../../../../plugins/external-mcps/src/index';
import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

const WRITABLE_WORKSPACE = createTestWorkspace('mcp-vertex-config-e2e-');
afterAll(() => removeTestWorkspace(WRITABLE_WORKSPACE));

const callTool = async (
	tool: IToolRegistration,
	args: unknown,
): Promise<Record<string, any>> => {
	let handler: (value: unknown) => Promise<{
		content: Array<{ text: string }>;
	}>;
	await tool.register({
		registerTool: (
			_name: string,
			_definition: unknown,
			next: typeof handler,
		) => {
			handler = next;
		},
	} as never);
	const result = await handler!(args);
	return JSON.parse(result.content[0]?.text ?? '{}');
};

describe('Configuration Center end-to-end metadata network', () => {
	it('joins bundled, user-local and disabled external plugins with owned artifacts', async () => {
		const external = {
			enabled: false,
			version: '1.2.3',
			command: 'npx',
			args: [
				'-y',
				'@example/mcp@1.2.3',
				'--workspace',
				'${workspaceFolder}',
			],
			env: ['EXAMPLE_TOKEN'],
		};
		const configDocument = {
			plugins: {
				'external-mcps': {
					options: { servers: { example: external } },
				},
				'project-plugin': {
					path: './project-plugin.ts',
					prefix: 'project-prefix',
					options: { mode: 'safe', futureOption: { retained: true } },
				},
			},
		};
		const args = parseCliArgs(
			[`--workspace=${WRITABLE_WORKSPACE}`, '--surface=native'],
			WRITABLE_WORKSPACE,
		);
		const { config } = await assembleCliConfig(args, {
			readFile: async (path) =>
				path.endsWith('mcp-vertex.config.json')
					? JSON.stringify(configDocument)
					: undefined,
			import: async (specifier) =>
				specifier.includes('external-mcps')
					? { default: externalMcps }
					: {
							default: {
								name: 'project-plugin',
								optionsSchema: z
									.object({
										mode: z.enum(['safe', 'fast']),
									})
									.passthrough(),
								register: () => ({
									prompts: [
										{
											id: 'project-prompt',
											register: async () => {},
										},
									],
									resources: [
										{
											id: 'project-resource',
											register: async () => {},
										},
									],
									knowledge: [
										{
											id: 'project-guide',
											title: 'Guide',
											body: 'Body',
										},
									],
								}),
							},
						},
		});
		const center = config.extraTools!.find(
			(tool) => tool.id === 'configuration_center',
		)!;
		const pluginPage = await callTool(center, {
			section: 'plugins',
			limit: 100,
		});

		const pluginIds = pluginPage.plugins.map(
			(entry: { id: string }) => entry.id,
		);
		expect(pluginIds).toContain('external-mcps');
		expect(pluginIds).toContain('project-plugin');
		expect(pluginIds).toContain('ext.example');
		const externalMcpsEntry = pluginPage.plugins.find(
			(entry: { id: string }) => entry.id === 'external-mcps',
		);
		expect(externalMcpsEntry?.origin).toBe('bundled');
		expect(externalMcpsEntry?.schemaStatus).toBe('available');
		const projectEntry = pluginPage.plugins.find(
			(entry: { id: string }) => entry.id === 'project-plugin',
		);
		expect(projectEntry?.origin).toBe('user-local');
		expect(projectEntry?.path).toBe('./project-plugin.ts');
		expect(projectEntry?.prefix).toBe('project-prefix');
		expect(projectEntry?.schemaStatus).toBe('available');
		const child = pluginPage.plugins.find(
			(entry: { id: string }) => entry.id === 'ext.example',
		);
		expect(child.optionsSchema.properties).toMatchObject({
			enabled: { type: 'boolean' },
			version: { type: 'string' },
			command: { type: 'string' },
			args: { type: 'array' },
			env: { type: 'array' },
		});

		const artifacts = await callTool(center, {
			section: 'artifacts',
			limit: 100,
		});
		expect(artifacts.artifacts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'project-prompt',
					kind: 'prompt',
					owner: { id: 'project-plugin', origin: 'user-local' },
				}),
				expect.objectContaining({
					id: 'project-resource',
					kind: 'resource',
					owner: { id: 'project-plugin', origin: 'user-local' },
				}),
				expect.objectContaining({
					id: 'project-guide',
					kind: 'knowledge',
					owner: { id: 'project-plugin', origin: 'user-local' },
				}),
			]),
		);
	});
});
