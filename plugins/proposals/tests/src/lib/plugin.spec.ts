import { describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@cartago-git/mcp-core/public';

import plugin from '@cartago-git/mcp-proposals';

const ctx = (): IMcpPluginContext => ({
	workspace: {
		root: '/ws',
		resolve: (relativePath: string) => `/ws/${relativePath}`,
	},
	corePaths: { cacheDir: '.cache/mcp-core', docsDir: 'docs/mcp-core' },
	cacheDir: '.cache/mcp-core',
	docsDir: 'docs/mcp-core',
	pluginCacheDir: '.cache/mcp-core/proposals',
	pluginDocsDir: 'docs/mcp-core/proposals',
	namespacePrefix: 'proposals',
	options: {},
	args: {},
});

describe('@cartago-git/mcp-proposals plugin', () => {
	it('exposes a valid IMcpPlugin identity', () => {
		expect(plugin.name).toBe('proposals');
		expect(typeof plugin.register).toBe('function');
	});

	it('registers the proposal workflow tools and knowledge', async () => {
		const registrations = await plugin.register(ctx());
		expect(registrations.tools?.map((tool) => tool.id)).toEqual([
			'agent_lock',
			'task_queue',
			'sync_proposals',
			'get_proposal_workflow',
			'round_context',
			'agent_names',
			'continue_proposal',
			'auto_work',
			'plan',
			'delegate',
			'create_proposal',
			'close_slice',
			'proposal_board',
			'state_health',
			'state_repair',
		]);
		expect(
			registrations.knowledge?.map((k) => k.id)
		).toContain('multi-agent-loop');
	});

	it('namespaces tool registration by the context prefix', async () => {
		const names: string[] = [];
		const fakeServer = {
			registerTool: (name: string) => {
				names.push(name);
			},
		} as unknown as Parameters<
			NonNullable<
				Awaited<ReturnType<typeof plugin.register>>['tools']
			>[number]['register']
		>[0];
		const registrations = await plugin.register({
			...ctx(),
			namespacePrefix: 'work',
		});
		for (const tool of registrations.tools ?? []) {
			await tool.register(fakeServer);
		}
		expect(names).toEqual([
			'work_agent_lock',
			'work_task_queue',
			'work_sync_proposals',
			'work_get_proposal_workflow',
			'work_round_context',
			'work_agent_names',
			'work_continue_proposal',
			'work_auto_work',
			'work_plan',
			'work_delegate',
			'work_create_proposal',
			'work_close_slice',
			'work_proposal_board',
		]);
	});
});
