import { describe, expect, it } from 'vitest';

import { McpStdioClient, NotificationsService } from '@mcp-vertex/client';

import {
	McpVertexStatusBar,
	type IStatusBarItem,
} from '../providers/status-bar';

const createItem = (): IStatusBarItem & {
	shown: boolean;
	disposed: boolean;
} => {
	const item = {
		text: '',
		shown: false,
		disposed: false,
		show() {
			this.shown = true;
		},
		dispose() {
			this.disposed = true;
		},
	} as IStatusBarItem & { shown: boolean; disposed: boolean };
	return item;
};

describe('McpVertexStatusBar', async () => {
	it('shows tool, proposal, token and agent segments', async () => {
		const item = createItem();
		const bar = new McpVertexStatusBar(
			item,
			{
				async listTools() {
					return [
						{
							name: 'mcp-vertex_overview',
							plugin: 'mcp-vertex',
							tags: [],
							effects: [],
						},
					];
				},
			},
			McpStdioClient.fromTransport({
				async callTool(input) {
					if (input.name === 'proposals_proposal_board') {
						return {
							structuredContent: {
								proposals: [{ id: 'f00014' }, { id: 'f00015' }],
							},
						};
					}
					if (input.name === 'mcp-vertex_metrics') {
						return {
							structuredContent: {
								tools: {},
								totals: {
									calls: 0,
									errors: 0,
									totalMs: 0,
									totalBytes: 4000,
								},
							},
						};
					}
					if (input.name === 'proposals_agent_names') {
						return {
							structuredContent: {
								agents: [
									{ name: 'implementation_runner' },
									{ name: 'delivery_verifier' },
								],
							},
						};
					}
					return { structuredContent: {} };
				},
			}),
		);

		await bar.start();

		expect(item.text).toContain('mcp-vertex');
		expect(item.text).toContain('1 tools');
		expect(item.text).toContain('2 proposals');
		expect(item.text).toContain('1.0k tok');
		expect(item.text).toContain('2 agents');
		expect(item.command).toBe('mcp-vertex.openDashboard');
		expect(item.shown).toBe(true);
	});

	it('falls back gracefully when metrics and agents tools are missing', async () => {
		const item = createItem();
		const bar = new McpVertexStatusBar(
			item,
			{
				async listTools() {
					return [];
				},
			},
			McpStdioClient.fromTransport({
				async callTool() {
					throw new Error('tool missing');
				},
			}),
		);
		await bar.start();
		// Without metrics or agents calls, the status bar should still
		// render the tool/proposal segments and not crash.
		expect(item.text).toContain('0 tools');
		expect(item.text).not.toContain('tok');
		expect(item.text).not.toContain('agents');
	});

	it('updates when notifications emit lifecycle events', async () => {
		const item = createItem();
		let toolCount = 1;
		const client = McpStdioClient.fromTransport({
			async callTool(input) {
				if (input.name === 'proposals_proposal_board') {
					return {
						structuredContent: { proposals: [{ id: 'f00014' }] },
					};
				}
				if (input.name === 'mcp-vertex_metrics') {
					return {
						structuredContent: {
							tools: {},
							totals: {
								calls: 0,
								errors: 0,
								totalMs: 0,
								totalBytes: 0,
							},
						},
					};
				}
				if (input.name === 'proposals_agent_names') {
					return { structuredContent: { agents: [] } };
				}
				return { structuredContent: {} };
			},
		});
		const notifications = new NotificationsService(client);
		const bar = new McpVertexStatusBar(
			item,
			{
				async listTools() {
					return Array.from({ length: toolCount }, (_, index) => ({
						name: `tool_${index}`,
						plugin: 'tool',
						tags: [],
						effects: [],
					}));
				},
			},
			client,
			notifications,
		);

		await bar.start();
		expect(item.text).toContain('1 tools');

		toolCount = 3;
		notifications.emitStatus('cap', 'checkpoint');
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(item.text).toContain('3 tools');
	});

	it('click opens the dashboard command', async () => {
		const item = createItem();
		const bar = new McpVertexStatusBar(
			item,
			{
				async listTools() {
					return [];
				},
			},
			McpStdioClient.fromTransport({
				async callTool() {
					return { structuredContent: {} };
				},
			}),
		);
		await bar.start();
		expect(item.command).toBe('mcp-vertex.openDashboard');
		expect(item.tooltip).toContain('Dashboard');
	});
});
