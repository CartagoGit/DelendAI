/**
 * proposals-commands.spec.ts — f00097 S4.
 *
 * Pins the board's local commands: `mcp-vertex.proposals.refresh` repaints via
 * the provider, `mcp-vertex.proposals.copyError` copies the raw payload to the
 * clipboard, and the global `mcp-vertex.refresh` also refreshes the board.
 */
import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@delendai/client';

import { REFRESH_COMMAND, registerRefreshCommand } from '../commands/refresh';
import {
	PROPOSALS_COPY_ERROR_COMMAND,
	PROPOSALS_REFRESH_COMMAND,
	registerProposalsCopyErrorCommand,
	registerProposalsRefreshCommand,
} from '../commands/proposals-commands';
import type { ICommandVscodeApi } from '../commands/types';

const client = McpStdioClient.fromTransport({
	async callTool() {
		return { structuredContent: {} };
	},
});

const createVscode = () => {
	const commands = new Map<
		string,
		(...args: readonly unknown[]) => unknown
	>();
	const messages: string[] = [];
	const clipboard: string[] = [];
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
		env: {
			clipboard: {
				async writeText(value) {
					clipboard.push(value);
				},
			},
		},
	};
	return { vscode, commands, messages, clipboard };
};

describe('proposals commands (f00097 S4)', () => {
	it('proposals.refresh repaints the board provider', async () => {
		const { vscode, commands, messages } = createVscode();
		let refreshed = 0;
		registerProposalsRefreshCommand({
			vscode,
			client,
			proposalsTree: { refresh: () => (refreshed += 1) },
		});
		await commands.get(PROPOSALS_REFRESH_COMMAND)?.();
		expect(refreshed).toBe(1);
		expect(messages[0]).toContain('proposals board refreshed');
	});

	it('proposals.copyError writes the raw payload to the clipboard', async () => {
		const { vscode, commands, clipboard } = createVscode();
		registerProposalsCopyErrorCommand({ vscode, client });
		await commands.get(PROPOSALS_COPY_ERROR_COMMAND)?.('{"bad":true}');
		expect(clipboard).toEqual(['{"bad":true}']);
	});

	it('proposals.copyError JSON-stringifies a non-string argument', async () => {
		const { vscode, commands, clipboard } = createVscode();
		registerProposalsCopyErrorCommand({ vscode, client });
		await commands.get(PROPOSALS_COPY_ERROR_COMMAND)?.({ bad: true });
		expect(clipboard).toEqual(['{"bad":true}']);
	});

	it('global refresh also refreshes the proposals board', async () => {
		const { vscode, commands } = createVscode();
		let toolRefreshed = 0;
		let proposalsRefreshed = 0;
		registerRefreshCommand({
			vscode,
			client,
			toolTree: { refresh: () => (toolRefreshed += 1) },
			proposalsTree: { refresh: () => (proposalsRefreshed += 1) },
		});
		await commands.get(REFRESH_COMMAND)?.();
		expect(toolRefreshed).toBe(1);
		expect(proposalsRefreshed).toBe(1);
	});
});
