/**
 * tool-surface.tool.spec.ts — the tools that show and change the surface,
 * driven through a listing client, as an agent reaches them.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@delendai/core/lib/contracts/interfaces/tool-registration.interface';
import {
	buildPluginActivateToolRegistration,
	buildPluginDeactivateToolRegistration,
	buildProjectContextToolRegistration,
	buildToolSearchToolRegistration,
} from '@delendai/core/lib/tools/tool-surface.tool';

const call = async (
	registration: IToolRegistration,
	name: string,
	args: Record<string, unknown> = {},
	listed = true,
) => {
	const server = new McpServer({ name: 's', version: '1' });
	await registration.register(server);
	const [near, far] = InMemoryTransport.createLinkedPair();
	const client = new Client({ name: 'c', version: '1' });
	await Promise.all([server.connect(near), client.connect(far)]);
	// A listing client checks a failure against the schema too; the host's
	// instrumentation conforms it, which this bare server does not have.
	if (listed) await client.listTools();
	return client.callTool({ name, arguments: args });
};

const entry = (skill?: string) => ({
	registrationId: 'r',
	name: 'd_r',
	toolId: 'r',
	active: true,
	detailsId: 'd',
	...(skill === undefined ? {} : { skill }),
});

const change = {
	pluginId: 'p',
	namespace: 'p',
	active: true,
	changedToolNames: [],
	visibleToolNames: [],
};

describe('tool_search', () => {
	const search = (entries: ReturnType<typeof entry>[]) =>
		call(
			buildToolSearchToolRegistration({
				namespacePrefix: 'd',
				runtimeAccess: {
					get: () => ({
						rankTools: () => ({ entries, found: true }),
					}),
				},
			}),
			'd_tool_search',
		);

	it('says how to load a skill when an entry names one', async () => {
		const { structuredContent } = await search([entry('a-skill')]);
		const text = JSON.stringify(structuredContent);
		expect(text).toContain('d_resolve_capability');
		expect(text).toContain('d_skill');
	});

	it('carries no hint when no entry names a skill', async () => {
		const { structuredContent } = await search([entry()]);
		expect(JSON.stringify(structuredContent)).not.toContain('skillHint');
	});

	it('fails stated while the runtime is not up', async () => {
		const result = await call(
			buildToolSearchToolRegistration({
				namespacePrefix: 'd',
				runtimeAccess: { get: () => undefined },
			}),
			'd_tool_search',
		);
		expect(result.isError).toBe(true);
	});
});

describe('project_context', () => {
	it('answers from the runtime', async () => {
		const context = {
			surfaceMode: 'managed' as const,
			workspaceRoot: '/w',
			configIssues: [],
			loadedPlugins: [],
			visibleToolCount: 1,
			hiddenToolCount: 0,
			visibleDomains: [],
		};
		const result = await call(
			buildProjectContextToolRegistration({
				namespacePrefix: 'd',
				runtimeAccess: {
					get: () => ({ getProjectContext: () => context }),
				},
				workspaceRoot: '/w',
				corePaths: { cacheDir: '.c', docsDir: 'docs' },
				configIssues: [],
			}),
			'd_project_context',
		);
		expect(JSON.stringify(result.structuredContent)).toContain('/w');
	});
});

describe('plugin activation', () => {
	const runtime = (found: boolean) => ({
		activatePlugin: () => (found ? change : null),
		deactivatePlugin: () => (found ? change : null),
	});

	it('activates, syncs the skills and tells the agent to refresh', async () => {
		const synced: [string, boolean][] = [];
		const { structuredContent } = await call(
			buildPluginActivateToolRegistration({
				namespacePrefix: 'd',
				runtimeAccess: { get: () => runtime(true) },
				syncSkills: async (plugin, active) => {
					synced.push([plugin, active]);
				},
			}),
			'd_plugin_activate',
			{ plugin: 'p' },
		);
		expect(synced).toEqual([['p', true]]);
		expect(JSON.stringify(structuredContent)).toContain('tools/list');
	});

	it('deactivates with no note', async () => {
		const { structuredContent } = await call(
			buildPluginDeactivateToolRegistration({
				namespacePrefix: 'd',
				runtimeAccess: { get: () => runtime(true) },
			}),
			'd_plugin_deactivate',
			{ plugin: 'p' },
		);
		expect(JSON.stringify(structuredContent)).not.toContain('note');
	});

	it('refuses a plugin it does not know', async () => {
		const result = await call(
			buildPluginActivateToolRegistration({
				namespacePrefix: 'd',
				runtimeAccess: { get: () => runtime(false) },
			}),
			'd_plugin_activate',
			{ plugin: 'nope' },
			false,
		);
		expect(result.isError).toBe(true);
	});
});
