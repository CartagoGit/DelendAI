import { describe, expect, it } from 'vitest';

import { McpStdioClient, type ISettingsStore } from '@mcp-vertex/client';

import {
	OPEN_SETTINGS_COMMAND,
	registerOpenSettingsCommand,
} from '../commands/open-settings';
import type { ICommandVscodeApi } from '../commands/types';

describe('mcp-vertex.openSettings', () => {
	it('opens a settings webview from the injected store', async () => {
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
		const store: ISettingsStore = {
			async read() {
				return {
					extension: {
						docsUrl: 'https://example.com/docs',
						allowLocalhost: false,
						allowPrivateIps: false,
						logLevel: 'debug',
						theme: 'dark',
					},
				};
			},
			async write() {
				throw new Error('not used');
			},
		};
		registerOpenSettingsCommand(
			{
				vscode,
				client: McpStdioClient.fromTransport({
					async callTool() {
						return { structuredContent: {} };
					},
				}),
			},
			store,
		);
		await commands.get(OPEN_SETTINGS_COMMAND)?.();
		expect(panels).toHaveLength(1);
		expect(panels[0]?.webview.html).toContain('mcp-vertex Settings');
		expect(panels[0]?.webview.html).toContain('https://example.com/docs');
	});
});
