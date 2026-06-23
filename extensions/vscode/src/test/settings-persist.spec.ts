/**
 * settings-persist.spec.ts — pinning contract for the
 * `mcp-vertex.saveSettings` / `mcp-vertex.resetSettings` handlers
 * (Fix #7 in `extensions/vscode/src/commands/open-settings.ts`).
 *
 * Before this test, the settings webview (rendered by `renderSettings`)
 * posted messages to `mcp-vertex.saveSettings` and
 * `mcp-vertex.resetSettings`, but those commands were never registered.
 * Every save was silently dropped on the floor.
 *
 * This test pins the new behaviour: the save handler persists the
 * payload to the shared `ISettingsStore`, and the reset handler
 * restores `DEFAULT_EXTENSION_SETTINGS`.
 */
import { describe, expect, it } from 'vitest';

import {
	DEFAULT_EXTENSION_SETTINGS,
	type ISettingsStore,
} from '@mcp-vertex/client';

import {
	RESET_SETTINGS_COMMAND,
	SAVE_SETTINGS_COMMAND,
	createExtensionSettingsStore,
	registerResetSettingsCommand,
	registerSaveSettingsCommand,
} from '../commands/open-settings';
import type { ICommandVscodeApi } from '../commands/types';

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

describe('settings save / reset commands', () => {
	it('saveSettings persists the payload to the shared store', async () => {
		const { vscode, commands, messages } = createVscode();
		const store: ISettingsStore = createExtensionSettingsStore();
		registerSaveSettingsCommand(vscode, store);

		expect(commands.has(SAVE_SETTINGS_COMMAND)).toBe(true);

		await commands.get(SAVE_SETTINGS_COMMAND)?.({
			extension: {
				docsUrl: 'https://example.com/docs',
				allowLocalhost: true,
				logLevel: 'debug',
				theme: 'light',
			},
		});

		const stored = (await store.read()) as {
			readonly extension?: Record<string, unknown>;
		};
		expect(stored.extension?.docsUrl).toBe('https://example.com/docs');
		expect(stored.extension?.allowLocalhost).toBe(true);
		expect(messages.some((m) => m.includes('saved'))).toBe(true);
	});

	it('saveSettings rejects malformed payloads with an error toast', async () => {
		const { vscode, commands, errors } = createVscode();
		const store = createExtensionSettingsStore();
		registerSaveSettingsCommand(vscode, store);

		// Pass a non-object: must surface an error, not crash.
		await commands.get(SAVE_SETTINGS_COMMAND)?.('not an object');
		expect(errors.length).toBeGreaterThanOrEqual(1);
		expect(errors[0]).toMatch(/invalid payload/);
	});

	it('resetSettings restores DEFAULT_EXTENSION_SETTINGS in the shared store', async () => {
		const { vscode, commands } = createVscode();
		const store = createExtensionSettingsStore();

		// Pre-mutate the store so we can prove reset actually overwrites.
		await store.write({
			extension: {
				docsUrl: 'https://mutated.example',
				allowLocalhost: true,
				allowPrivateIps: true,
				logLevel: 'debug',
				theme: 'dark',
			},
		});

		registerResetSettingsCommand(vscode, store);
		expect(commands.has(RESET_SETTINGS_COMMAND)).toBe(true);

		await commands.get(RESET_SETTINGS_COMMAND)?.();

		const stored = (await store.read()) as {
			readonly extension?: Record<string, unknown>;
		};
		expect(stored.extension?.docsUrl).toBe(
			DEFAULT_EXTENSION_SETTINGS.docsUrl,
		);
		expect(stored.extension?.allowLocalhost).toBe(
			DEFAULT_EXTENSION_SETTINGS.allowLocalhost,
		);
		expect(stored.extension?.theme).toBe(DEFAULT_EXTENSION_SETTINGS.theme);
	});
});
