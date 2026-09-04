import { describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@delendai/core/public';

import plugin from '@delendai/proposals';
import {
	resolveProposalPersistMode,
	validateProposalConfiguration,
} from '@delendai/proposals';
import { createFakeToolServer } from '@delendai/test-kit/public';

const ctx = (): IMcpPluginContext => ({
	workspace: {
		root: '/ws',
		resolve: (relativePath: string) => `/ws/${relativePath}`,
	},
	corePaths: { cacheDir: '.cache/delendai', docsDir: 'docs/delendai' },
	cacheDir: '.cache/delendai',
	docsDir: 'docs/delendai',
	keepLegacy: false,
	pluginCacheDir: '.cache/delendai/proposals',
	pluginDocsDir: 'docs/delendai/proposals',
	namespacePrefix: 'proposals',
	options: {},
	args: {},
});

describe('@delendai/proposals plugin', async () => {
	it('allows commit-policy to own slice persistence over proposals fallback', () => {
		const issues = validateProposalConfiguration({
			pluginName: 'proposals',
			enabledPlugins: ['proposals', 'commit-policy'],
			pluginOptions: new Map([
				['proposals', { persist: { mode: 'commit' } }],
				[
					'commit-policy',
					{
						commit: { enabled: true },
						cadence: { triggers: [{ kind: 'slice' }] },
						push: { enabled: true, onCommit: true },
					},
				],
			]),
		});

		expect(issues).toEqual([]);
	});

	it('allows complementary slice ownership when proposals persistence is disabled', () => {
		const issues = validateProposalConfiguration({
			pluginName: 'proposals',
			enabledPlugins: ['proposals', 'commit-policy'],
			pluginOptions: new Map([
				['proposals', { persist: { mode: 'none' } }],
				[
					'commit-policy',
					{
						commit: { enabled: true },
						cadence: { triggers: [{ kind: 'slice' }] },
						push: { enabled: true, onCommit: true },
					},
				],
			]),
		});

		expect(issues).toEqual([]);
	});

	it.each([
		['none', undefined, 'none'],
		['commit', undefined, 'commit'],
		['commit-and-push', undefined, 'commit-and-push'],
		['none', { commit: { enabled: true } }, 'none'],
		['commit', { commit: { enabled: true } }, 'commit'],
		['commit-and-push', { commit: { enabled: true } }, 'commit-and-push'],
		[
			'commit-and-push',
			{
				commit: { enabled: true },
				cadence: { triggers: [{ kind: 'manual' }] },
			},
			'commit-and-push',
		],
		[
			'commit-and-push',
			{
				commit: { enabled: false },
				cadence: { triggers: [{ kind: 'slice' }] },
			},
			'commit-and-push',
		],
		[
			'none',
			{
				commit: { enabled: true },
				cadence: { triggers: [{ kind: 'slice' }] },
			},
			'none',
		],
		[
			'commit',
			{
				commit: { enabled: true },
				cadence: { triggers: [{ kind: 'slice' }] },
			},
			'none',
		],
		[
			'commit-and-push',
			{
				commit: { enabled: true },
				cadence: { triggers: [{ kind: 'slice' }] },
			},
			'none',
		],
	] as const)('resolves %s with %s to %s', (mode, policy, expected) => {
		expect(resolveProposalPersistMode(mode as never, policy)).toBe(
			expected,
		);
	});

	it('exposes a valid IMcpPlugin identity', async () => {
		expect(plugin.name).toBe('proposals');
		expect(typeof plugin.register).toBe('function');
	});

	it('registers the proposal workflow tools and knowledge', async () => {
		const registrations = await plugin.register(ctx());
		expect(registrations.tools?.map((tool) => tool.id)).toEqual([
			'agent_lock',
			'agents_lock_diagnose',
			'agent_worktree',
			'branch_status',
			'branch_gc',
			'swarm_hygiene',
			'task_queue',
			'sync_proposals',
			'get_proposal_workflow',
			'proposal_get',
			'round_context',
			'agent_names',
			'continue_proposal',
			'auto_work',
			'plan',
			'delegate',
			'proposal_transition',
			'proposals_close_plan',
			'create_proposal',
			'close_slice',
			'proposal_review',
			'proposal_board',
			'proposal_adopt',
			'inherit_host_instructions',
			'incident_proposals',
			'auto_fix_queue',
			'state_health',
			'state_repair',
			'compact_status',
			'proposal_stale_list',
			'agent_lock_release_orphan',
			'proposal_force_transition',
			'proposal_reconcile_folder',
			'proposal_diagnose',
		]);
		expect(registrations.knowledge?.map((k) => k.id)).toContain(
			'multi-agent-loop',
		);
	});

	it('namespaces tool registration by the context prefix', async () => {
		const names: string[] = [];
		const fakeServer = createFakeToolServer({
			onRegisterTool: (call) => names.push(call.name),
		});
		const registrations = await plugin.register({
			...ctx(),
			namespacePrefix: 'work',
		});
		for (const tool of registrations.tools ?? []) {
			await tool.register(fakeServer);
		}
		expect(names).toEqual([
			'work_agent_lock',
			'work_agents_lock_diagnose',
			'work_agent_worktree',
			'work_branch_status',
			'work_branch_gc',
			'work_swarm_hygiene',
			'work_task_queue',
			'work_sync_proposals',
			'work_get_proposal_workflow',
			'work_proposal_get',
			'work_round_context',
			'work_agent_names',
			'work_continue_proposal',
			'work_auto_work',
			'work_plan',
			'work_delegate',
			'work_proposal_transition',
			'work_proposals_close_plan',
			'work_create_proposal',
			'work_close_slice',
			'work_proposal_review',
			'work_proposal_board',
			'work_proposal_adopt',
			'work_inherit_host_instructions',
			'work_incident_proposals',
			'work_auto_fix_queue',
			'work_state_health',
			'work_state_repair',
			'work_compact_status',
			'work_proposal_stale_list',
			'work_agent_lock_release_orphan',
			'work_proposal_force_transition',
			'work_proposal_reconcile_folder',
			'work_proposal_diagnose',
		]);
	});

	// f00052 S5 — the host-scoped gate defaults to blocked. With a context
	// that does not enable the capability (agentWorktreeEnabled unset/false),
	// proposals_agent_worktree stays registered but refuses with a
	// structured ok:false error and the documented reason — without ever
	// shelling out to git.
	it('agent_worktree is blocked by default (host gate off)', async () => {
		type ToolHandler = (args: { action: string }) => Promise<{
			structuredContent?: Record<string, unknown>;
			isError?: boolean;
		}>;
		let handler: ToolHandler | undefined;
		const fakeServer = createFakeToolServer({
			onRegisterTool: (call) => {
				handler = call.handler as ToolHandler;
			},
		});
		const registrations = await plugin.register(ctx());
		const worktree = registrations.tools?.find(
			(t) => t.id === 'agent_worktree',
		);
		expect(worktree).toBeDefined();
		await worktree?.register(fakeServer);
		expect(handler).toBeDefined();
		const result = await handler?.({ action: 'create' });
		expect(result?.isError).toBe(true);
		expect(result?.structuredContent?.ok).toBe(false);
		expect(result?.structuredContent?.action).toBe('create');
		expect(result?.structuredContent?.reason).toBe(
			'agent_worktree is disabled by host configuration. Pass --agent-worktree=true (CLI) or set agentWorktree: true in delendai.config.json to enable.',
		);
	});
});
