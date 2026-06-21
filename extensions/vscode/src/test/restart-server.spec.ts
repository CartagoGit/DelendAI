import { describe, expect, it } from 'vitest';

import {
	RESTART_SERVER_COMMAND,
	registerRestartServerCommand,
} from '../commands/restart-server';
import type { ICommandVscodeApi } from '../commands/types';

const createVscode = () => {
	const commands = new Map<
		string,
		(...args: readonly unknown[]) => unknown
	>();
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
				return { webview: { html: '' } };
			},
			async showInformationMessage(message) {
				messages.push(message);
				return undefined;
			},
		},
	};
	return { vscode, commands, messages };
};

describe('mcp-vertex.restartServer', () => {
	it('uses a custom restartFn when provided', async () => {
		const { vscode, commands, messages } = createVscode();
		let called = false;
		registerRestartServerCommand(vscode, {
			restartFn: async () => {
				called = true;
			},
		});
		expect(commands.has(RESTART_SERVER_COMMAND)).toBe(true);
		await commands.get(RESTART_SERVER_COMMAND)?.();
		expect(called).toBe(true);
		expect(messages).toContain('mcp-vertex: server restarted.');
	});

	it('falls back to an info message when no restartFn is provided', async () => {
		const { vscode, commands, messages } = createVscode();
		registerRestartServerCommand(vscode);
		await commands.get(RESTART_SERVER_COMMAND)?.();
		expect(messages[0]).toMatch(/please restart the extension/);
	});
});
