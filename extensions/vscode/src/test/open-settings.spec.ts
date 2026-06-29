import { describe, expect, it } from 'vitest';

import {
	DEFAULT_EXTENSION_SETTINGS,
	McpStdioClient,
	type IExtensionSettings,
	type ISettingsStore,
} from '@mcp-vertex/client';

import {
	OPEN_SETTINGS_COMMAND,
	SAVE_SETTINGS_COMMAND,
	registerOpenSettingsCommand,
	registerSaveSettingsCommand,
} from '../commands/open-settings';
import type { ICommandVscodeApi } from '../commands/types';

describe('mcp-vertex.openSettings', async () => {
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

describe('mcp-vertex.saveSettings (f00062 S3: boundary parse)', () => {
	const createVscode = (): {
		vscode: ICommandVscodeApi;
		commands: Map<string, (...args: readonly unknown[]) => unknown>;
		messages: string[];
		errors: string[];
	} => {
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

	const createRecordingStore = (): ISettingsStore & { writes: unknown[] } => {
		const writes: unknown[] = [];
		let value: unknown = { extension: DEFAULT_EXTENSION_SETTINGS };
		return {
			writes,
			async read() {
				return value;
			},
			async write(next) {
				writes.push(next);
				value = next;
			},
		};
	};

	it('rejects a payload with stringified booleans (H13 closure)', async () => {
		const { vscode, commands, errors } = createVscode();
		const store = createRecordingStore();
		registerSaveSettingsCommand(vscode, store);
		const save = commands.get(SAVE_SETTINGS_COMMAND);
		expect(save).toBeDefined();
		await save?.({
			docsUrl: 'https://mcp-vertex.dev',
			allowLocalhost: 'true',
			allowPrivateIps: 'false',
			logLevel: 'info',
			theme: 'system',
		});
		expect(errors.length).toBeGreaterThan(0);
		expect(store.writes.length).toBe(0);
	});

	it('accepts a well-typed full settings payload and writes to the store', async () => {
		const { vscode, commands, messages } = createVscode();
		const store = createRecordingStore();
		registerSaveSettingsCommand(vscode, store);
		const save = commands.get(SAVE_SETTINGS_COMMAND);
		expect(save).toBeDefined();
		const valid: IExtensionSettings = {
			docsUrl: 'https://mcp-vertex.dev',
			allowLocalhost: true,
			allowPrivateIps: false,
			logLevel: 'info',
			theme: 'system',
		};
		await save?.(valid);
		expect(messages).toContain('mcp-vertex: settings saved.');
		expect(store.writes.length).toBe(1);
		const written = store.writes[0] as { extension?: IExtensionSettings };
		expect(written.extension).toEqual(valid);
	});

	it('rejects a payload with an invalid logLevel enum', async () => {
		const { vscode, commands, errors } = createVscode();
		const store = createRecordingStore();
		registerSaveSettingsCommand(vscode, store);
		const save = commands.get(SAVE_SETTINGS_COMMAND);
		await save?.({
			docsUrl: 'https://mcp-vertex.dev',
			allowLocalhost: true,
			allowPrivateIps: false,
			logLevel: 'verbose',
			theme: 'system',
		});
		expect(errors.length).toBeGreaterThan(0);
		expect(store.writes.length).toBe(0);
	});

	it('rejects a payload with a non-URL docsUrl', async () => {
		const { vscode, commands, errors } = createVscode();
		const store = createRecordingStore();
		registerSaveSettingsCommand(vscode, store);
		const save = commands.get(SAVE_SETTINGS_COMMAND);
		await save?.({
			docsUrl: 'not-a-url',
			allowLocalhost: true,
			allowPrivateIps: false,
			logLevel: 'info',
			theme: 'system',
		});
		expect(errors.length).toBeGreaterThan(0);
		expect(store.writes.length).toBe(0);
	});
});
