import {
	DEFAULT_EXTENSION_SETTINGS,
	SettingsService,
	type IExtensionSettings,
	type IExtensionSettingsPatch,
	type ISettingsStore,
} from '@mcp-vertex/client';
import { renderSettings } from '@mcp-vertex/ui-extension/public';

import type { ICommandDeps, ICommandVscodeApi } from './types';
import { showCommandError } from './types';

export const OPEN_SETTINGS_COMMAND = 'mcp-vertex.openSettings';

/** Save handler — wired to the `renderSettings` webview in f00047 S6. */
export const SAVE_SETTINGS_COMMAND = 'mcp-vertex.saveSettings';

/** Reset handler — wired to the `renderSettings` webview in f00047 S6. */
export const RESET_SETTINGS_COMMAND = 'mcp-vertex.resetSettings';

const createInMemorySettingsStore = (): ISettingsStore => {
	let value: unknown = { extension: DEFAULT_EXTENSION_SETTINGS };
	return {
		async read() {
			return value;
		},
		async write(next) {
			value = next;
		},
	};
};

/**
 * Exported factory so `extension.ts` can build the store ONCE and
 * share it across the open/save/reset registrations. Sharing matters:
 * the save handler writes to the same store the open handler will read
 * from on the next invocation — otherwise the user would see their
 * changes silently dropped on next open.
 */
export const createExtensionSettingsStore = (): ISettingsStore =>
	createInMemorySettingsStore();

export const registerOpenSettingsCommand = (
	deps: ICommandDeps,
	store: ISettingsStore = createInMemorySettingsStore(),
) =>
	deps.vscode.commands.registerCommand(OPEN_SETTINGS_COMMAND, async () => {
		const service = new SettingsService(store);
		const settings = await service.get();
		const panel = deps.vscode.window.createWebviewPanel(
			'mcpVertexSettings',
			'mcp-vertex Settings',
			deps.vscode.ViewColumn.One,
			{ enableScripts: true },
		);
		panel.webview.html = renderSettings({
			settings,
			saveCommand: SAVE_SETTINGS_COMMAND,
			resetCommand: RESET_SETTINGS_COMMAND,
		});
		return panel;
	});

/**
 * Save handler — invoked by the settings webview when the user clicks
 * "Save". Accepts the new settings payload (already validated by the
 * webview) and persists it to the shared store.
 *
 * Previously this command did not exist, so saves were silently dropped.
 */
export const registerSaveSettingsCommand = (
	vscode: ICommandVscodeApi,
	store: ISettingsStore,
) =>
	vscode.commands.registerCommand(
		SAVE_SETTINGS_COMMAND,
		async (rawInput?: unknown) => {
			const next = parseSettingsInput(rawInput);
			if (next === undefined) {
				await vscode.window.showErrorMessage?.(
					'mcp-vertex: saveSettings received an invalid payload.',
				);
				return undefined;
			}
			const service = new SettingsService(store);
			await service.set(next);
			await vscode.window.showInformationMessage?.(
				'mcp-vertex: settings saved.',
			);
			return { saved: true };
		},
	);

/**
 * Reset handler — invoked by the settings webview when the user clicks
 * "Reset to defaults". We rewrite the store back to
 * `DEFAULT_EXTENSION_SETTINGS` and return the new value so the webview
 * can refresh its form.
 */
export const registerResetSettingsCommand = (
	vscode: ICommandVscodeApi,
	store: ISettingsStore,
) =>
	vscode.commands.registerCommand(RESET_SETTINGS_COMMAND, async () => {
		const service = new SettingsService(store);
		const settings = await service.set({
			...DEFAULT_EXTENSION_SETTINGS,
		});
		await vscode.window.showInformationMessage?.(
			'mcp-vertex: settings reset to defaults.',
		);
		return settings;
	});

const parseSettingsInput = (
	raw: unknown,
): IExtensionSettingsPatch | undefined => {
	if (raw === null || typeof raw !== 'object') return undefined;
	const candidate = raw as { extension?: unknown };
	const extension = candidate.extension;
	if (extension === null || typeof extension !== 'object') return undefined;
	return extension as IExtensionSettingsPatch;
};

/** `showCommandError` re-export so this module owns the settings chain. */
export { showCommandError };
