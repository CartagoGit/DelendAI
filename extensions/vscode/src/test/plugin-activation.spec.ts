import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@mcp-vertex/client';

import { registerPluginActivationCommand } from '../commands/plugin-activation';
import { PLUGIN_ACTIVATION_COMMAND } from '../contracts/constants/plugin-activation-command.constant';
import { assertPluginSwitchboardStringsComplete } from '../i18n/plugin-switchboard.strings';

describe('plugin activation command', () => {
	it('has complete switchboard copy for all 12 languages', () => {
		expect(assertPluginSwitchboardStringsComplete()).toEqual([]);
	});

	it('requests activation detail, toggles the picked row and offers restart', async () => {
		let callback: (() => Promise<void>) | undefined;
		const writes: unknown[] = [];
		const executions: string[] = [];
		registerPluginActivationCommand({
			client: McpStdioClient.fromTransport({
				async callTool(input) {
					expect(input.name).toBe('mcp-vertex_overview');
					expect(input.arguments).toEqual({
						compact: true,
						activation: true,
					});
					return {
						structuredContent: {
							activationReport: {
								entries: [
									{
										id: 'git',
										origin: 'bundled',
										active: true,
										source: 'preset',
										toolCount: 3,
									},
								],
							},
						},
					};
				},
			}),
			vscode: {
				ViewColumn: { One: 1 },
				commands: {
					registerCommand(command, cb) {
						expect(command).toBe(PLUGIN_ACTIVATION_COMMAND);
						callback = cb as () => Promise<void>;
						return { dispose() {} };
					},
					async executeCommand(command) {
						executions.push(command);
					},
				},
				workspace: {
					workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
				},
				window: {
					createWebviewPanel: () => ({ webview: { html: '' } }),
					async showQuickPick(items) {
						return items[0];
					},
					async showInformationMessage(_message, action) {
						return action;
					},
				},
			},
			async setActivation(input) {
				writes.push(input);
			},
		});

		await callback?.();
		expect(writes).toEqual([
			{
				workspaceRoot: '/workspace',
				id: 'git',
				origin: 'bundled',
				active: false,
			},
		]);
		expect(executions).toEqual(['mcp-vertex.restartServer']);
	});
});
