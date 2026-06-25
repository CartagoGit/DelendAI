import { describe, expect, it } from 'vitest';

import { ToolTreeDataProvider } from '../providers/tool-tree-data-provider';
import { TreeItemCollapsibleState } from '../providers/tool-tree-node';

describe('ToolTreeDataProvider', async () => {
	it('builds server, plugin and tool levels from overview tools', async () => {
		const provider = new ToolTreeDataProvider({
			async listTools() {
				return [
					{
						name: 'mcp-vertex_proposals_proposal_board',
						plugin: 'proposals',
						summary: 'Show proposals',
						tags: ['workflow'],
						effects: [],
					},
					{
						name: 'mcp-vertex_quality_run_quality',
						plugin: 'quality',
						summary: 'Run quality',
						tags: ['quality'],
						effects: ['spawn'],
					},
					{
						name: 'proposals_continue',
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
			label: 'mcp-vertex',
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
			'proposals_continue',
			'mcp-vertex_proposals_proposal_board',
		]);
		expect(proposalTools[1]).toMatchObject({
			description: 'Show proposals',
			tooltip: 'Show proposals',
			collapsibleState: TreeItemCollapsibleState.None,
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
});
