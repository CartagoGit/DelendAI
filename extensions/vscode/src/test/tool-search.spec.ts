import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@mcp-vertex/client';

import {
	TOOL_SEARCH_COMMAND,
	registerToolSearchCommand,
} from '../commands/tool-search';
import type { ICommandVscodeApi } from '../commands/types';

const createVscode = () => {
	const commands = new Map<
		string,
		(...args: readonly unknown[]) => unknown
	>();
	const panels: Array<{ webview: { html: string } }> = [];
	const messages: string[] = [];
	const picks: string[] = [];
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
			async showInformationMessage(message) {
				messages.push(message);
				return undefined;
			},
			async showQuickPick(items) {
				const first = items[0];
				if (first === undefined) return undefined;
				picks.push(first.id);
				return first.id;
			},
		},
	};
	return { vscode, commands, panels, messages, picks };
};

describe('mcp-vertex.toolSearch', () => {
	it('opens a quick pick with the live tool list', async () => {
		const { vscode, commands, picks, messages } = createVscode();
		let overviewCalls = 0;
		registerToolSearchCommand({
			vscode,
			client: McpStdioClient.fromTransport({
				async callTool(input) {
					if (input.name === 'mcp-vertex_overview') {
						overviewCalls += 1;
						if (overviewCalls === 1) {
							expect(input.arguments).toEqual({
								compact: true,
							});
						}
						return {
							structuredContent: {
								server: {
									name: 'mcp-vertex',
									version: '0.1.0',
								},
								namespacePrefix: 'mcp-vertex',
								plugins: [],
								tools: [
									{
										name: 'mcp-vertex_overview',
										tags: ['orientation'],
									},
									{
										name: 'proposals_proposal_board',
										tags: ['proposals'],
									},
								],
								knowledge: [],
								recommendedNextAction: '',
							},
						};
					}
					if (input.name === 'mcp-vertex_knowledge') {
						return { structuredContent: { entries: [] } };
					}
					return { structuredContent: {} };
				},
			}),
		});
		expect(commands.has(TOOL_SEARCH_COMMAND)).toBe(true);
		await commands.get(TOOL_SEARCH_COMMAND)?.();
		expect(picks.length).toBeGreaterThan(0);
		expect(picks[0]).toMatch(/^tool:/);
		expect(overviewCalls).toBe(2);
		// When the user picks a tool, the command calls it and shows
		// an info message with the result.
		expect(messages.some((m) => m.includes('mcp-vertex_overview'))).toBe(
			true,
		);
	});

	it('shows an info message when no items are available', async () => {
		const { vscode, commands, messages } = createVscode();
		registerToolSearchCommand({
			vscode,
			client: McpStdioClient.fromTransport({
				async callTool() {
					return { structuredContent: {} };
				},
			}),
		});
		await commands.get(TOOL_SEARCH_COMMAND)?.();
		expect(messages[0]).toMatch(/no tools or knowledge/);
	});
});
