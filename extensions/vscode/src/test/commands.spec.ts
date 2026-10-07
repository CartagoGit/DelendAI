import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@delendai/client';

import {
	OPEN_PROPOSAL_COMMAND,
	registerOpenProposalCommand,
} from '../commands/open-proposal';
import { REFRESH_COMMAND, registerRefreshCommand } from '../commands/refresh';
import {
	RUN_VALIDATION_COMMAND,
	registerRunValidationCommand,
} from '../commands/run-validation';
import {
	SHOW_METRICS_COMMAND,
	registerShowMetricsCommand,
} from '../commands/show-metrics';
import { registerShowOverviewCommand } from '../commands/show-overview';
import type { ICommandVscodeApi } from '../commands/types';
import { SHOW_OVERVIEW_COMMAND } from '../extension';

const createVscode = () => {
	const commands = new Map<
		string,
		(...args: readonly unknown[]) => unknown
	>();
	const panels: Array<{ webview: { html: string } }> = [];
	const messages: string[] = [];
	const errors: string[] = [];
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
	return { vscode, commands, panels, messages, errors };
};

describe('command wiring', async () => {
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
		expect(messages).toEqual(['delendai refreshed']);
	});

	it('runs validation commands and renders their result', async () => {
		const { vscode, commands, panels } = createVscode();
		const calls: string[] = [];
		registerRunValidationCommand({
			vscode,
			client: McpStdioClient.fromTransport({
				async callTool(input) {
					calls.push(input.name);
					if (input.name === 'delendai_get_validation_matrix') {
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
			'delendai_get_validation_matrix',
			'delendai_quality_run_quality',
		]);
		expect(panels[0]?.webview.html).toContain('delendai Validation');
	});

	it('shows an error when validation commands fail', async () => {
		const { vscode, commands, errors, panels } = createVscode();
		registerRunValidationCommand({
			vscode,
			client: McpStdioClient.fromTransport({
				async callTool() {
					throw new Error('server offline');
				},
			}),
		});

		await commands.get(RUN_VALIDATION_COMMAND)?.();

		expect(errors).toEqual([
			'delendai: run validation failed: Failed to call MCP tool "delendai_get_validation_matrix": server offline',
		]);
		expect(panels).toHaveLength(0);
	});

	it('opens the proposal board command', async () => {
		const { vscode, commands, panels } = createVscode();
		registerOpenProposalCommand({
			vscode,
			client: McpStdioClient.fromTransport({
				async callTool(input) {
					expect(input.name).toBe(
						'delendai_proposals_proposal_board',
					);
					return {
						structuredContent: {
							proposals: [
								{
									id: 'f00014',
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

		expect(panels[0]?.webview.html).toContain('f00014');
	});

	it('shows an error when the proposal board command fails', async () => {
		const { vscode, commands, errors, panels } = createVscode();
		registerOpenProposalCommand({
			vscode,
			client: McpStdioClient.fromTransport({
				async callTool() {
					throw new Error('proposal tool missing');
				},
			}),
		});

		await commands.get(OPEN_PROPOSAL_COMMAND)?.();

		expect(errors).toEqual([
			'delendai: open proposals failed: Failed to call MCP tool "delendai_proposals_proposal_board": proposal tool missing',
		]);
		expect(panels).toHaveLength(0);
	});

	it('shows an error when the overview command fails', async () => {
		const { vscode, commands, errors, panels } = createVscode();
		registerShowOverviewCommand({
			vscode,
			client: McpStdioClient.fromTransport({
				async callTool() {
					throw new Error('overview unavailable');
				},
			}),
		});

		await commands.get(SHOW_OVERVIEW_COMMAND)?.();

		expect(errors).toEqual([
			'delendai: show overview failed: Failed to call MCP tool "delendai_overview": overview unavailable',
		]);
		expect(panels).toHaveLength(0);
	});

	it('opens the overview command with compact output by default', async () => {
		const { vscode, commands, panels } = createVscode();
		registerShowOverviewCommand({
			vscode,
			client: McpStdioClient.fromTransport({
				async callTool(input) {
					expect(input.name).toBe('delendai_overview');
					expect(input.arguments).toEqual({ compact: true });
					return {
						structuredContent: {
							server: { name: 'delendai', version: '0.1.0' },
							namespacePrefix: 'delendai',
							plugins: [],
							tools: [],
							knowledge: [],
							recommendedNextAction: '',
						},
					};
				},
			}),
		});

		await commands.get(SHOW_OVERVIEW_COMMAND)?.();

		expect(panels[0]?.webview.html).toContain('delendai Overview');
	});

	it('shows an error when the metrics command fails', async () => {
		const { vscode, commands, errors, panels } = createVscode();
		registerShowMetricsCommand({
			vscode,
			client: McpStdioClient.fromTransport({
				async callTool() {
					throw new Error('metrics unavailable');
				},
			}),
		});

		await commands.get(SHOW_METRICS_COMMAND)?.();

		expect(errors).toEqual([
			'delendai: show metrics failed: Failed to call MCP tool "delendai_metrics": metrics unavailable',
		]);
		expect(panels).toHaveLength(0);
	});
});
