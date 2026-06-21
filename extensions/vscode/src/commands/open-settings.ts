import {
	DEFAULT_EXTENSION_SETTINGS,
	SettingsService,
	type ISettingsStore,
} from '@mcp-vertex/client';
import { renderSettings } from '@mcp-vertex/ui-extension/public';

import type { ICommandDeps } from './types';

export const OPEN_SETTINGS_COMMAND = 'mcp-vertex.openSettings';

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
			saveCommand: 'mcp-vertex.saveSettings',
			resetCommand: 'mcp-vertex.resetSettings',
		});
		return panel;
	});
