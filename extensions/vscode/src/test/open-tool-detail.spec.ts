import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@delendai/client';

import {
	buildToolDetailHtml,
	registerOpenToolDetailCommand,
} from '../commands/open-tool-detail';
import { OPEN_TOOL_DETAIL_COMMAND } from '../contracts/constants/open-tool-detail-command.constant';
import type { ICommandVscodeApi } from '../commands/types';

const createClient = () =>
	McpStdioClient.fromTransport({
		async callTool(input) {
			if (input.name === 'mcp-vertex_overview') {
				return {
					structuredContent: {
						namespacePrefix: 'mcp-vertex',
						server: { name: 'mcp-vertex', version: '0.1.0' },
						plugins: ['proposals'],
						tools: {
							proposals: ['proposal_board'],
						},
						knowledge: [],
						recommendedNextAction: 'Open detail.',
					},
				};
			}
			if (input.name === 'mcp-vertex_metrics') {
				return {
					structuredContent: {
						tools: {
							'mcp-vertex_proposals_proposal_board': {
								calls: 2,
								errors: 0,
								totalMs: 30,
								maxMs: 20,
							},
						},
					},
				};
			}
			if (input.name === 'mcp-vertex_knowledge') {
				return {
					structuredContent: {
						entries: [
							{
								id: 'proposals_workflow',
								title: 'Proposals workflow',
							},
						],
					},
				};
			}
			return { structuredContent: {} };
		},
		async listTools() {
			return {
				tools: [
					{
						name: 'mcp-vertex_proposals_proposal_board',
						description: 'Show proposals',
						inputSchema: {
							type: 'object',
							properties: {},
						},
						outputSchema: {
							type: 'object',
							properties: {
								proposals: { type: 'array' },
							},
						},
					},
				],
			};
		},
	});

describe('mcp-vertex.openToolDetail', () => {
	it('renders schemas and metrics for a selected tool', async () => {
		const { html, model } = await buildToolDetailHtml(
			{ client: createClient() },
			'mcp-vertex_proposals_proposal_board',
		);

		expect(html).toContain('mcp-vertex_proposals_proposal_board');
		expect(html).toContain('Input schema');
		expect(html).toContain('Output schema');
		expect(html).toContain('2 calls, 0 errors, max 20ms');
		expect(html).toContain('proposals');
		expect(model.tool.name).toBe('mcp-vertex_proposals_proposal_board');
	});

	it('registers the command and opens a webview panel', async () => {
		const commands = new Map<
			string,
			(...args: readonly unknown[]) => unknown
		>();
		const panels: Array<{ webview: { html: string } }> = [];
		const vscode: ICommandVscodeApi = {
			ViewColumn: { One: 1 },
			commands: {
				registerCommand(command, callback) {
					commands.set(command, callback);
					return { dispose() {} };
				},
			},
			window: {
				createWebviewPanel() {
					const panel = { webview: { html: '' } };
					panels.push(panel);
					return panel;
				},
			},
		};

		registerOpenToolDetailCommand({ vscode, client: createClient() });
		await commands.get(OPEN_TOOL_DETAIL_COMMAND)?.(
			'mcp-vertex_proposals_proposal_board',
		);

		expect(panels).toHaveLength(1);
		expect(panels[0]?.webview.html).toContain('Output schema');
	});
});
