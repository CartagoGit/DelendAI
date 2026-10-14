import { describe, expect, it } from 'vitest';

import { ToolTreeDataProvider } from '../providers/tool-tree-data-provider';
import { TreeItemCollapsibleState } from '../providers/tool-tree-node';

describe('ToolTreeDataProvider', async () => {
	it('builds server, plugin and tool levels from overview tools', async () => {
		const provider = new ToolTreeDataProvider({
			async listTools() {
				return [
					{
						name: 'delendai_proposals_proposal_board',
						plugin: 'proposals',
						summary: 'Show proposals',
						tags: ['workflow'],
						effects: [],
					},
					{
						name: 'delendai_quality_run_quality',
						plugin: 'quality',
						summary: 'Run quality',
						tags: ['quality'],
						effects: ['spawn'],
					},
					{
						name: 'delendai_proposals_continue',
						plugin: 'proposals',
						tags: [],
						effects: [],
					},
				];
			},
		});

		const [server] = await provider.getChildren();
		expect(server).toMatchObject({
			kind: 'server',
			label: 'Server',
			collapsibleState: TreeItemCollapsibleState.Expanded,
		});

		const plugins = await provider.getChildren(server);
		expect(plugins.map((plugin) => plugin.label)).toEqual([
			'proposals',
			'quality',
		]);
		expect(plugins[0]).toMatchObject({
			description: '2 tools',
			collapsibleState: TreeItemCollapsibleState.Collapsed,
		});

		const proposalTools = await provider.getChildren(plugins[0]);
		expect(proposalTools.map((tool) => tool.label)).toEqual([
			'delendai_proposals_continue',
			'delendai_proposals_proposal_board',
		]);
		expect(proposalTools[1]).toMatchObject({
			description: 'Show proposals',
			tooltip: 'Show proposals',
			collapsibleState: TreeItemCollapsibleState.None,
			command: {
				command: 'delendai.openToolDetail',
				arguments: [
					{
						name: 'delendai_proposals_proposal_board',
						plugin: 'proposals',
						summary: 'Show proposals',
					},
				],
			},
		});
	});

	it('refreshes when the config watcher emits changes', async () => {
		const provider = new ToolTreeDataProvider({
			async listTools() {
				return [];
			},
		});
		const listeners: Array<() => void> = [];
		const fired: unknown[] = [];
		provider.onDidChangeTreeData((event) => {
			fired.push(event);
		});

		const watcherDisposable = provider.bindConfigWatcher({
			onDidChange(listener) {
				listeners.push(listener);
				return { dispose() {} };
			},
			onDidCreate(listener) {
				listeners.push(listener);
				return { dispose() {} };
			},
			onDidDelete(listener) {
				listeners.push(listener);
				return { dispose() {} };
			},
		});

		listeners[0]?.();
		expect(fired).toEqual([undefined]);
		watcherDisposable.dispose();
	});

	it("says next to a plugin's tool count when it cannot work here, and why", async () => {
		const provider = new ToolTreeDataProvider({
			async listTools() {
				return [
					{
						name: 'delendai_roadmap_status',
						plugin: 'roadmap',
						tags: [],
						effects: [],
					},
					{
						name: 'delendai_memory_recall',
						plugin: 'memory',
						tags: [],
						effects: [],
					},
				];
			},
			async pluginAvailability() {
				return new Map([
					[
						'roadmap',
						{
							state: 'needs-configuration',
							missing: 'no roadmap file',
							fix: 'set plugins.roadmap.options.file',
						},
					],
					['memory', { state: 'registered' }],
				]);
			},
		});
		const [server] = await provider.getChildren();
		const plugins = await provider.getChildren(server);
		expect(plugins.map((plugin) => plugin.description)).toEqual([
			'1 tools',
			'1 tools · needs configuration',
		]);
		expect(plugins[1]?.tooltip).toBe(
			'no roadmap file\nFix: set plugins.roadmap.options.file',
		);
	});

	it('still lists the plugins when the server cannot say whether they work', async () => {
		const provider = new ToolTreeDataProvider({
			async listTools() {
				return [
					{
						name: 'delendai_memory_recall',
						plugin: 'memory',
						tags: [],
						effects: [],
					},
				];
			},
			async pluginAvailability() {
				throw new Error('overview unavailable');
			},
		});
		const [server] = await provider.getChildren();
		const plugins = await provider.getChildren(server);
		expect(plugins.map((plugin) => plugin.description)).toEqual([
			'1 tools',
		]);
	});

	it('groups skills and actionable proposals, refreshes on config changes, and drops listeners', async () => {
		let calls = 0;
		const provider = new ToolTreeDataProvider(
			{
				async listTools() {
					calls += 1;
					return [];
				},
			},
			{
				async getSkills() {
					return [
						{
							id: 'review',
							version: '1.0.0',
							minCoreVersion: '0.1.0',
							summary: 'Review a change',
							appliesTo: [],
							tags: [],
							bodyPath: 'skills/review.md',
						},
					];
				},
				async getProposals() {
					return [
						{
							id: 'f00762',
							title: 'Plugin availability',
							track: 'general',
							status: 'in-progress' as const,
							kind: 'feat',
						},
					];
				},
			},
		);
		const roots = await provider.getChildren();
		expect(roots.map((node) => node.label)).toEqual([
			'Skills',
			'Actionable proposals',
			'Server',
		]);
		expect(provider.getTreeItem(roots[0]!)).toBe(roots[0]);
		expect((await provider.getChildren(roots[0]))[0]).toMatchObject({
			label: 'review',
		});
		expect((await provider.getChildren(roots[1]))[0]).toMatchObject({
			label: 'f00762',
			description: 'in-progress · Plugin availability',
		});
		const changes: unknown[] = [];
		const listener = provider.onDidChangeTreeData((change) =>
			changes.push(change),
		);
		const handlers: Array<() => void> = [];
		const watch = (handler: () => void) => {
			handlers.push(handler);
			return { dispose: () => undefined };
		};
		const binding = provider.bindConfigWatcher({
			onDidChange: watch,
			onDidCreate: watch,
			onDidDelete: watch,
		});
		await provider.getChildren(roots[2]);
		for (const handler of handlers) handler();
		expect(changes).toHaveLength(3);
		await provider.getChildren(roots[2]);
		expect(calls).toBe(2);
		binding.dispose();
		listener.dispose();
		provider.refresh();
		expect(changes).toHaveLength(3);
	});
});
