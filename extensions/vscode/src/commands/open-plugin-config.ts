/**
 * open-plugin-config.ts — context-menu entry on every `plugin:`
 * node in the Tools tree. Reuses the host-agnostic
 * Configuration Center so the user gets a single source of truth
 * (the editor with inputs/selects/checks derived from the JSON
 * schema) instead of a bespoke form per plugin.
 *
 * The optional `pluginId` argument narrows the center to one
 * plugin; absent → full center (which already lists every plugin
 * by section).
 */
import {
	buildConfigurationCenterModel,
	renderConfigurationCenter,
	withCsp,
} from '@delendai/ui-extension/public';

import { CONFIGURATION_CENTER_MESSAGE_SCHEMA } from '../contracts/constants/configuration-center-message-schema.constant';
import { defaultLang, type Lang } from '../i18n';
import { configurationCenterStringsByLang } from '../i18n/configuration-center.strings';
import {
	formatToolName,
	readConfigurationDocument,
	type IConfigurationArtifact,
	type IConfigurationCenterResult,
	type IConfigurationPlugin,
} from '@delendai/client';
import type { ICommandDeps } from './types';
import { showCommandError } from './types';

export const OPEN_PLUGIN_CONFIG_COMMAND = 'mcp-vertex.openPluginConfig';

const bridgeScript = `<script>
(function () {
	'use strict';
	var vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
	window.__MCPV_CONFIGURATION_HOST__ = {
		post: function (message) { if (vscode) vscode.postMessage(message); }
	};
})();
</script>`;

const injectBridge = (html: string): string => {
	const index = html.lastIndexOf('<script');
	return index < 0
		? html.replace('</body>', `${bridgeScript}</body>`)
		: `${html.slice(0, index)}${bridgeScript}${html.slice(index)}`;
};

const readAll = async <T>(
	deps: ICommandDeps,
	section: 'plugins' | 'artifacts',
	select: (page: IConfigurationCenterResult) => readonly T[] | undefined,
): Promise<readonly T[]> => {
	const tool = formatToolName(deps.namespacePrefix, 'configuration_center');
	const entries: T[] = [];
	const seen = new Set<number>();
	let cursor = 0;
	for (;;) {
		if (seen.has(cursor))
			throw new Error(`repeated ${section} cursor ${cursor}`);
		seen.add(cursor);
		const page = await deps.client.request<
			{ section: typeof section; cursor: number; limit: number },
			IConfigurationCenterResult
		>(tool, { section, cursor, limit: 100 });
		entries.push(...(select(page) ?? []));
		if (page.page.nextCursor === null) return entries;
		cursor = page.page.nextCursor;
	}
};

export const registerOpenPluginConfigCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(
		OPEN_PLUGIN_CONFIG_COMMAND,
		async (rawPluginId?: unknown) => {
			const lang: Lang = defaultLang;
			const strings = configurationCenterStringsByLang[lang];
			const folder = deps.vscode.workspace?.workspaceFolders?.[0];
			if (folder === undefined) {
				await deps.vscode.window.showErrorMessage?.(
					strings.workspaceRequired,
				);
				return;
			}
			const workspaceRoot = folder.uri.fsPath;
			const pluginId =
				typeof rawPluginId === 'string' && rawPluginId.length > 0
					? rawPluginId
					: undefined;
			try {
				const tool = formatToolName(
					deps.namespacePrefix,
					'configuration_center',
				);
				const [document, config, summary, plugins, artifacts] =
					await Promise.all([
						readConfigurationDocument({ workspaceRoot }),
						deps.client.request<
							{ section: 'config' },
							IConfigurationCenterResult
						>(tool, { section: 'config' }),
						deps.client.request<
							{ section: 'summary' },
							IConfigurationCenterResult
						>(tool, { section: 'summary' }),
						readAll<IConfigurationPlugin>(
							deps,
							'plugins',
							(page) => page.plugins,
						),
						readAll<IConfigurationArtifact>(
							deps,
							'artifacts',
							(page) => page.artifacts,
						),
					]);
				if (config.configSchema === undefined) {
					throw new Error('configuration schema is unavailable');
				}
				const model = buildConfigurationCenterModel({
					document,
					copy: strings.copy,
					configSchema: config.configSchema,
					plugins,
					artifacts,
					unavailableArtifactKinds:
						summary.summary?.unavailableArtifactKinds ?? [],
				});
				const html = withCsp(
					'configuration-center',
					injectBridge(
						renderConfigurationCenter({
							model,
							lang,
							...(pluginId === undefined ? {} : { pluginId }),
						}),
					),
				);
				const panel = deps.vscode.window.createWebviewPanel(
					'mcpVertexPluginConfig',
					pluginId === undefined
						? strings.panelTitle
						: `${strings.panelTitle} — ${pluginId}`,
					deps.vscode.ViewColumn.One,
					{ enableScripts: true },
				);
				panel.webview.html = html;
				panel.webview.onDidReceiveMessage?.((raw: unknown) => {
					void raw;
				});
				// Lightweight refresh-on-edit so the user sees their
				// changes without re-opening the panel.
				panel.webview.onDidReceiveMessage?.(async (raw: unknown) => {
					const parsed =
						CONFIGURATION_CENTER_MESSAGE_SCHEMA.safeParse(raw);
					if (!parsed.success) return;
					if (parsed.data.command === 'discardConfiguration') {
						panel.webview.html = html;
					}
				});
				return panel;
			} catch (err) {
				await showCommandError(deps.vscode, 'open plugin config', err);
				return;
			}
		},
	);
