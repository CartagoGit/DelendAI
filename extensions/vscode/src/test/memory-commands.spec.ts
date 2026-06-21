import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@mcp-vertex/client';

import {
	MEMORY_FORGET_COMMAND,
	registerMemoryForgetCommand,
} from '../commands/memory-forget';
import {
	MEMORY_SAVE_COMMAND,
	registerMemorySaveCommand,
} from '../commands/memory-save';
import type { ICommandVscodeApi } from '../commands/types';
import { MemoryTreeDataProvider } from '../providers/memory-tree-data-provider';

const createVscode = () => {
	const commands = new Map<
		string,
		(...args: readonly unknown[]) => unknown
	>();
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
				return { webview: { html: '' } };
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
	return { vscode, commands, messages, errors };
};

describe('memory commands', () => {
	it('saves a memory note and refreshes the tree', async () => {
		const { vscode, commands, messages } = createVscode();
		let refreshed = false;
		registerMemorySaveCommand({
			vscode,
			client: McpStdioClient.fromTransport({
				async callTool(input) {
					expect(input.name).toBe('memory_save');
					return {
						structuredContent: {
							ok: true,
							saved: {
								id: 'n1',
								title: 'Decision',
								body: 'Body',
								tags: ['vscode'],
								createdAt: '2026-06-21T00:00:00.000Z',
								updatedAt: '2026-06-21T00:00:00.000Z',
							},
							redactedSecrets: 0,
						},
					};
				},
			}),
			memoryTree: {
				refresh: () => {
					refreshed = true;
				},
			},
		});
		await commands.get(MEMORY_SAVE_COMMAND)?.({
			title: 'Decision',
			body: 'Body',
		});
		expect(refreshed).toBe(true);
		expect(messages[0]).toContain('n1');
	});

	it('requires an id before forgetting a note', async () => {
		const { vscode, commands, errors } = createVscode();
		registerMemoryForgetCommand({
			vscode,
			client: McpStdioClient.fromTransport({
				async callTool() {
					throw new Error('should not call');
				},
			}),
		});
		await commands.get(MEMORY_FORGET_COMMAND)?.();
		expect(errors[0]).toMatch(/requires a note id/);
	});

	it('lists memory notes in the tree provider', async () => {
		const provider = new MemoryTreeDataProvider({
			async list() {
				return {
					notes: [
						{ id: 'n1', title: 'Decision', tags: ['proposal'] },
					],
					total: 1,
					offset: 0,
				};
			},
		});
		const children = await provider.getChildren();
		expect(children[0]?.label).toBe('Decision');
		expect(children[0]?.description).toBe('proposal');
	});
});
