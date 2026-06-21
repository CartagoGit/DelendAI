import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@mcp-vertex/client';

import {
	OPEN_KNOWLEDGE_COMMAND,
	fetchKnowledgeEntry,
	registerOpenKnowledgeCommand,
} from '../commands/open-knowledge';
import type { ICommandVscodeApi } from '../commands/types';

const createVscode = () => {
	const panels: Array<{ webview: { html: string } }> = [];
	const messages: string[] = [];
	const errors: string[] = [];
	const commands = new Map<
		string,
		(...args: readonly unknown[]) => unknown
	>();
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
			async showErrorMessage(message) {
				errors.push(message);
				return undefined;
			},
		},
	};
	return { vscode, panels, messages, errors, commands };
};

describe('mcp-vertex.openKnowledge', () => {
	it('opens a webview with a category-grouped list', async () => {
		const { vscode, panels, commands } = createVscode();
		registerOpenKnowledgeCommand({
			vscode,
			client: McpStdioClient.fromTransport({
				async callTool() {
					return {
						structuredContent: {
							entries: [
								{
									id: 'proposals_state_machine',
									title: 'Proposal state machine',
								},
								{
									id: 'mcp-vertex_overview',
									title: 'Overview',
								},
							],
						},
					};
				},
			}),
		});
		expect(commands.has(OPEN_KNOWLEDGE_COMMAND)).toBe(true);
		await commands.get(OPEN_KNOWLEDGE_COMMAND)?.();
		expect(panels).toHaveLength(1);
		expect(panels[0]?.webview.html).toContain('data-category="proposals"');
		expect(panels[0]?.webview.html).toContain('data-category="mcp-vertex"');
		expect(panels[0]?.webview.html).toContain('Proposal state machine');
		expect(panels[0]?.webview.html).toContain('mcp-vertex Knowledge');
	});

	it('shows an error info message when the body is missing', async () => {
		const { vscode, errors } = createVscode();
		const client = McpStdioClient.fromTransport({
			async callTool() {
				return { structuredContent: { id: 'foo', title: 'Foo' } };
			},
		});
		let caught: unknown;
		try {
			await fetchKnowledgeEntry(vscode, client, 'missing');
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(Error);
		expect(errors[0]).toMatch(/not found/);
	});
});
