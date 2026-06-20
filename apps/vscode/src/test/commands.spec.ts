import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@mcp-vertex/client';

import {
	OPEN_PROPOSAL_COMMAND,
	registerOpenProposalCommand,
} from '../commands/open-proposal';
import { REFRESH_COMMAND, registerRefreshCommand } from '../commands/refresh';
import {
	RUN_VALIDATION_COMMAND,
	registerRunValidationCommand,
} from '../commands/run-validation';
import type { ICommandVscodeApi } from '../commands/types';

const createVscode = () => {
	const commands = new Map<
		string,
		(...args: readonly unknown[]) => unknown
	>();
	const panels: Array<{ webview: { html: string } }> = [];
	const messages: string[] = [];
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
		},
	};
	return { vscode, commands, panels, messages };
};

describe('command wiring', () => {
	it('refreshes the tree provider', async () => {
		const { vscode, commands, messages } = createVscode();
		let refreshed = false;
		registerRefreshCommand({
			vscode,
			client: McpStdioClient.fromTransport({
				async callTool() {
					return { structuredContent: {} };
				},
			}),
			toolTree: {
				refresh: () => {
					refreshed = true;
				},
			},
		});

		await commands.get(REFRESH_COMMAND)?.();

		expect(refreshed).toBe(true);
		expect(messages).toEqual(['mcp-vertex refreshed']);
	});

	it('runs validation commands and renders their result', async () => {
		const { vscode, commands, panels } = createVscode();
		const calls: string[] = [];
		registerRunValidationCommand({
			vscode,
			client: McpStdioClient.fromTransport({
				async callTool(input) {
					calls.push(input.name);
					if (input.name === 'mcp-vertex_get_validation_matrix') {
						return { structuredContent: { scopes: { all: [] } } };
					}
					return {
						structuredContent: {
							scope: 'all',
							ok: true,
							results: [],
						},
					};
				},
			}),
		});

		await commands.get(RUN_VALIDATION_COMMAND)?.();

		expect(calls).toEqual([
			'mcp-vertex_get_validation_matrix',
			'quality_run_quality',
		]);
		expect(panels[0]?.webview.html).toContain('mcp-vertex Validation');
	});

	it('opens the proposal board command', async () => {
		const { vscode, commands, panels } = createVscode();
		registerOpenProposalCommand({
			vscode,
			client: McpStdioClient.fromTransport({
				async callTool(input) {
					expect(input.name).toBe('proposals_proposal_board');
					return {
						structuredContent: {
							proposals: [
								{
									id: 'f114',
									status: 'in-progress',
									slices: [],
								},
							],
						},
					};
				},
			}),
		});

		await commands.get(OPEN_PROPOSAL_COMMAND)?.();

		expect(panels[0]?.webview.html).toContain('f114');
	});
});
