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
	SETTINGS_STATE_KEY,
	createExtensionSettingsStore,
	createGlobalStateSettingsStore,
	registerResetSettingsCommand,
	registerSaveSettingsCommand,
	type ISettingsMemento,
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

describe('settings save / reset commands', async () => {
	it('saveSettings persists the payload to the shared store', async () => {
		const { vscode, commands, messages } = createVscode();
		const store: ISettingsStore = createExtensionSettingsStore();
		registerSaveSettingsCommand(vscode, store);

		expect(commands.has(SAVE_SETTINGS_COMMAND)).toBe(true);

		// f00062 S3: the wire payload is the FLAT `IExtensionSettings`
		// shape (the schema is the single source of truth). The previous
		// handler looked for `{ extension: { ... } }` and silently
		// dropped saves that did not match. The host now `safeParse`s
		// the top-level object, so the test must send all five fields.
		await commands.get(SAVE_SETTINGS_COMMAND)?.({
			docsUrl: 'https://example.com/docs',
			allowLocalhost: true,
			allowPrivateIps: false,
			logLevel: 'debug',
			theme: 'light',
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

/**
 * f00079 S3 (closes a00040 H4): settings must survive a window reload.
 * We model `globalState` as a durable map and prove that a value written
 * through one store instance is visible to a SECOND store instance built
 * from the same backing map — i.e. the value outlives the module-scope
 * cache the way a reload re-instantiates the extension.
 */
const createMemento = (
	backing: Map<string, unknown> = new Map(),
): ISettingsMemento => ({
	get<T>(key: string): T | undefined {
		return backing.get(key) as T | undefined;
	},
	async update(key: string, value: unknown): Promise<void> {
		backing.set(key, value);
	},
});

describe('settings persistence to globalState', async () => {
	it('persists a written value to the backing globalState key', async () => {
		const backing = new Map<string, unknown>();
		const store = createGlobalStateSettingsStore(createMemento(backing));

		await store.write({
			extension: {
				docsUrl: 'https://persisted.example',
				allowLocalhost: true,
				allowPrivateIps: false,
				logLevel: 'warn',
				theme: 'light',
			},
		});

		const blob = backing.get(SETTINGS_STATE_KEY) as {
			readonly extension?: Record<string, unknown>;
		};
		expect(blob.extension?.docsUrl).toBe('https://persisted.example');
	});

	it('survives a simulated window reload (new store, same globalState)', async () => {
		const backing = new Map<string, unknown>();

		// First "session": write a setting.
		const first = createGlobalStateSettingsStore(createMemento(backing));
		await first.write({
			extension: {
				docsUrl: 'https://reload.example',
				allowLocalhost: false,
				allowPrivateIps: true,
				logLevel: 'error',
				theme: 'dark',
			},
		});

		// Second "session": a fresh store built from the SAME backing map
		// (as a reload would re-instantiate the extension) must hydrate the
		// previously written value.
		const reloaded = createGlobalStateSettingsStore(createMemento(backing));
		const value = (await reloaded.read()) as {
			readonly extension?: Record<string, unknown>;
		};
		expect(value.extension?.docsUrl).toBe('https://reload.example');
		expect(value.extension?.theme).toBe('dark');
	});

	it('createExtensionSettingsStore is durable when given a memento', async () => {
		const backing = new Map<string, unknown>();
		const store = createExtensionSettingsStore(createMemento(backing));
		await store.write({
			extension: {
				docsUrl: 'https://factory.example',
				allowLocalhost: true,
				allowPrivateIps: true,
				logLevel: 'info',
				theme: 'system',
			},
		});
		expect(backing.has(SETTINGS_STATE_KEY)).toBe(true);
	});
});
