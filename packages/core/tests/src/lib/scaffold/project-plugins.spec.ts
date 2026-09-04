import { describe, expect, it } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
	PROJECT_PLUGINS_CREATE_INPUT_SCHEMA,
	buildProjectPluginsCreateToolRegistration,
	buildProjectPluginsInspectToolRegistration,
	buildProjectPluginsRepairToolRegistration,
	createWorkspacePathProvider,
} from '@delendai/core/public';
import type { IToolRegistration } from '@delendai/core/public';

const registrationNames = async (
	registration: IToolRegistration,
): Promise<string> => {
	let name = '';
	await registration.register({
		registerTool(toolName: string) {
			name = toolName;
		},
	} as unknown as McpServer);
	return name;
};

describe('project plugins', () => {
	it('accepts only the strict create contract', () => {
		expect(
			PROJECT_PLUGINS_CREATE_INPUT_SCHEMA.safeParse({ name: 'demo' })
				.success,
		).toBe(true);
		expect(
			PROJECT_PLUGINS_CREATE_INPUT_SCHEMA.safeParse({
				name: 'demo',
				extra: true,
			}).success,
		).toBe(false);
	});

	it('registers the three project plugin operations', async () => {
		const options = {
			namespacePrefix: 'delendai',
			workspace: createWorkspacePathProvider('/tmp'),
		};
		expect(
			await registrationNames(
				buildProjectPluginsCreateToolRegistration(options),
			),
		).toBe('delendai_project_plugins_create');
		expect(
			await registrationNames(
				buildProjectPluginsInspectToolRegistration(options),
			),
		).toBe('delendai_project_plugins_inspect');
		expect(
			await registrationNames(
				buildProjectPluginsRepairToolRegistration(options),
			),
		).toBe('delendai_project_plugins_repair');
	});
});
