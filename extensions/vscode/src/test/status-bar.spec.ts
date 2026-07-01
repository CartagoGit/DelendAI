import { describe, expect, it } from 'vitest';

import type { INotificationEventName } from '@mcp-vertex/client';
import { McpStdioClient, NotificationsService } from '@mcp-vertex/client';

import {
	McpVertexStatusBar,
	type IStatusBarItem,
	type IStatusBarEventConfig,
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
					if (input.name === 'mcp-vertex_proposals_proposal_board') {
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
					if (input.name === 'mcp-vertex_proposals_agent_names') {
						return {
							structuredContent: {
								assignments: [
									{
										agent_name: 'implementation_runner',
										status: 'active',
									},
									{
										agent_name: 'delivery_verifier',
										status: 'active',
									},
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
				if (input.name === 'mcp-vertex_proposals_proposal_board') {
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
				if (input.name === 'mcp-vertex_proposals_agent_names') {
					return { structuredContent: { assignments: [] } };
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

describe('STATUS_BAR_EVENTS discriminated union (H30)', () => {
	it('subscribes to every union event and removes them on dispose', async () => {
		const subscribed: string[] = [];
		const removed: string[] = [];
		const notifications = {
			addEventListener(name: INotificationEventName): void {
				subscribed.push(name);
			},
			removeEventListener(name: INotificationEventName): void {
				removed.push(name);
			},
		};
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
			notifications as never,
		);
		await bar.start();
		// Every canonical notification event name is subscribed.
		expect(subscribed.sort()).toEqual(
			['bloqueado', 'cap', 'lock-released'].sort(),
		);
		bar.dispose();
		expect(removed.sort()).toEqual(subscribed.sort());
	});

	it('keys the config map on the discriminated union (compile-time OCP)', () => {
		// A status-bar event config is the value shape of the exhaustive
		// map. Adding a new INotificationEventName without a map entry is a
		// *compile* error in status-bar.ts (Record<INotificationEventName>),
		// which is the H30 guarantee. This runtime assertion only pins the
		// locale-neutral reason codes so the union stays i18n-clean.
		const reasons: ReadonlyArray<IStatusBarEventConfig['reason']> = [
			'lock',
			'capacity',
			'blocked',
		];
		expect(reasons).toContain('lock');
		// @ts-expect-error — a Spanish/English literal is not a valid reason.
		const bad: IStatusBarEventConfig['reason'] = 'bloqueado';
		expect(bad).toBeDefined();
	});
});
