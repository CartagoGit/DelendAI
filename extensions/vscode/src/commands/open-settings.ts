import {
	DEFAULT_EXTENSION_SETTINGS,
	SettingsService,
	type IExtensionSettings,
	type ISettingsStore,
} from '@mcp-vertex/client';
import { ExtensionSettingsSchema } from '@mcp-vertex/ui-extension/public';
import { defaultLang, dictsByLang, type Lang } from '../i18n';
import { renderSettings, withCsp } from '@mcp-vertex/ui-extension/public';

import type { ICommandDeps, ICommandVscodeApi } from './types';
import { HOST_LANG_KEY } from './setup-github';
import { showCommandError } from './types';

export const OPEN_SETTINGS_COMMAND = 'mcp-vertex.openSettings';

/** Save handler — wired to the `renderSettings` webview in f00047 S6. */
export const SAVE_SETTINGS_COMMAND = 'mcp-vertex.saveSettings';

/** Reset handler — wired to the `renderSettings` webview in f00047 S6. */
export const RESET_SETTINGS_COMMAND = 'mcp-vertex.resetSettings';

const resolveLang = (deps: ICommandDeps): Lang => {
	const persisted = deps.globalState?.get<unknown>(HOST_LANG_KEY);
	return typeof persisted === 'string' && persisted in dictsByLang
		? (persisted as Lang)
		: defaultLang;
};

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

/** Key under which the extension settings blob lives in `globalState`. */
export const SETTINGS_STATE_KEY = 'mcp-vertex.settings';

/**
 * Minimal `globalState` surface this store needs. Mirrors
 * `vscode.Memento` (`get`/`update`) so the real extension context and
 * the test fakes both satisfy it.
 */
export interface ISettingsMemento {
	get<T>(key: string): T | undefined;
	update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

/**
 * f00079 S3 (closes a00040 H4): persist settings to `globalState`
 * instead of module-scope memory, so the user's choices survive a
 * window reload. We keep an in-memory cache hydrated from `globalState`
 * at construction so the first `read()` is consistent even before any
 * write; every `write()` updates both the cache and the durable
 * `globalState` blob. The stored shape is `{ extension: IExtensionSettings }`
 * — the same envelope the in-memory store used, so the rest of the
 * settings chain (SettingsService) is unchanged.
 */
export const createGlobalStateSettingsStore = (
	globalState: ISettingsMemento,
): ISettingsStore => {
	const seeded = globalState.get<unknown>(SETTINGS_STATE_KEY);
	let cache: unknown =
		seeded !== undefined
			? seeded
			: { extension: DEFAULT_EXTENSION_SETTINGS };
	return {
		async read() {
			return cache;
		},
		async write(next) {
			cache = next;
			await globalState.update(SETTINGS_STATE_KEY, next);
		},
	};
};

/**
 * Exported factory so `extension.ts` can build the store ONCE and
 * share it across the open/save/reset registrations. Sharing matters:
 * the save handler writes to the same store the open handler will read
 * from on the next invocation — otherwise the user would see their
 * changes silently dropped on next open.
 *
 * When a `globalState` memento is supplied (the real activation path)
 * the store is durable (f00079 S3 / a00040 H4); when omitted (unit
 * tests that do not exercise persistence) it falls back to an in-memory
 * store with identical semantics.
 */
export const createExtensionSettingsStore = (
	globalState?: ISettingsMemento,
): ISettingsStore =>
	globalState !== undefined
		? createGlobalStateSettingsStore(globalState)
		: createInMemorySettingsStore();

export const registerOpenSettingsCommand = (
	deps: ICommandDeps,
	store: ISettingsStore = createInMemorySettingsStore(),
) =>
	deps.vscode.commands.registerCommand(OPEN_SETTINGS_COMMAND, async () => {
		const lang = resolveLang(deps);
		const service = new SettingsService(store);
		const settings = await service.get();
		const panel = deps.vscode.window.createWebviewPanel(
			'mcpVertexSettings',
			'mcp-vertex Settings',
			deps.vscode.ViewColumn.One,
			{ enableScripts: true },
		);
		// f00079 S1 (a00040 H2): wrap the settings webview HTML in its CSP.
		panel.webview.html = withCsp(
			'settings',
			renderSettings({
				settings,
				saveCommand: SAVE_SETTINGS_COMMAND,
				resetCommand: RESET_SETTINGS_COMMAND,
				lang: dictsByLang[lang],
			}),
		);
		// FIX (S1): the webview posts `{command:'save', settings}` and
		// `{command:'reset'}` from its client script. Previously the
		// host never listened, so Save/Reset were visual-only. We now
		// bridge the message to the SettingsService so the persisted
		// store actually reflects the user's choices, and re-render
		// the form on reset so the visible fields update too.
		panel.webview.onDidReceiveMessage?.(async (msg: unknown) => {
			if (typeof msg !== 'object' || msg === null) return;
			const m = msg as { command?: unknown; settings?: unknown };
			if (m.command === 'save') {
				const patch = parseSettingsInput(m.settings);
				if (patch === undefined) {
					await deps.vscode.window.showErrorMessage?.(
						'mcp-vertex: saveSettings received an invalid payload.',
					);
					return;
				}
				const svc = new SettingsService(store);
				await svc.set(patch);
				return;
			}
			if (m.command === 'reset') {
				const svc = new SettingsService(store);
				await svc.set(DEFAULT_EXTENSION_SETTINGS);
				const fresh = await svc.get();
				panel.webview.html = withCsp(
					'settings',
					renderSettings({
						settings: fresh,
						saveCommand: SAVE_SETTINGS_COMMAND,
						resetCommand: RESET_SETTINGS_COMMAND,
						lang: dictsByLang[lang],
					}),
				);
			}
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

/**
 * Parse the settings payload at the extension boundary. Closes the
 * schema half of H4 (f00062 S3): a malformed wire payload (wrong
 * types, missing fields, an invalid `logLevel` or `theme` enum) is
 * rejected BEFORE it reaches the `ISettingsStore`. The previous
 * loose cast (`as IExtensionSettingsPatch`) let any object through;
 * the new `safeParse` produces a typed `IExtensionSettings` on
 * success and `undefined` on failure.
 */
const parseSettingsInput = (raw: unknown): IExtensionSettings | undefined => {
	const parsed = ExtensionSettingsSchema.safeParse(raw);
	return parsed.success ? parsed.data : undefined;
};

/** `showCommandError` re-export so this module owns the settings chain. */
export { showCommandError };
