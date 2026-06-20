import { describe, expect, it } from 'vitest';

import { McpStdioClient, NotificationsService } from '@mcp-vertex/client';

import {
	McpVertexStatusBar,
	type IStatusBarItem,
} from '../providers/status-bar';

const createItem = (): IStatusBarItem & {
	shown: boolean;
	disposed: boolean;
} => ({
	text: '',
	shown: false,
	disposed: false,
	show() {
		this.shown = true;
	},
	dispose() {
		this.disposed = true;
	},
});

describe('McpVertexStatusBar', () => {
	it('shows tool and proposal counts', async () => {
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
					expect(input.name).toBe('proposals_proposal_board');
					return {
						structuredContent: {
							proposals: [{ id: 'f114' }, { id: 'f115' }],
						},
					};
				},
			}),
		);

		await bar.start();

		expect(item.text).toBe('$(tools) mcp-vertex • 1 tools • 2 proposals');
		expect(item.command).toBe('mcp-vertex.showOverview');
		expect(item.shown).toBe(true);
	});

	it('updates when notifications emit lifecycle events', async () => {
		const item = createItem();
		let toolCount = 1;
		const client = McpStdioClient.fromTransport({
			async callTool() {
				return {
					structuredContent: {
						proposals: [{ id: 'f114' }],
					},
				};
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
});
