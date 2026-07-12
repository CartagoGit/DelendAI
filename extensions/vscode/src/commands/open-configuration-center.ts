import { basename } from 'node:path';

import {
	formatToolName,
	readConfigurationDocument,
	saveConfigurationDocument,
	type ConfigurationArtifactKind,
	type IConfigurationArtifact,
	type IConfigurationCenterResult,
	type IConfigurationPlugin,
} from '@mcp-vertex/client';
import {
	buildConfigurationCenterModel,
	renderConfigurationCenter,
	withCsp,
} from '@mcp-vertex/ui-extension/public';

import { CONFIGURATION_CENTER_MESSAGE_SCHEMA } from '../contracts/constants/configuration-center-message-schema.constant';
import { defaultLang, dictsByLang, type Lang } from '../i18n';
import { configurationCenterStringsByLang } from '../i18n/configuration-center.strings';
import { RESTART_SERVER_COMMAND } from './restart-server';
import { HOST_LANG_KEY } from './setup-github';
import type { ICommandDeps } from './types';
import { showCommandError } from './types';

const OPEN_CONFIGURATION_CENTER_COMMAND = 'mcp-vertex.openConfigurationCenter';
type ConfigurationCenterStrings =
	(typeof configurationCenterStringsByLang)[Lang];

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

const selectWorkspace = async (
	deps: ICommandDeps,
	strings: ConfigurationCenterStrings,
): Promise<string | undefined> => {
	const folders = deps.vscode.workspace?.workspaceFolders ?? [];
	if (folders.length === 0) {
		await deps.vscode.window.showErrorMessage?.(strings.workspaceRequired);
		return undefined;
	}
	if (folders.length === 1) return folders[0]?.uri.fsPath;
	const picked = await deps.vscode.window.showQuickPick?.(
		folders.map((folder) => ({
			id: folder.uri.fsPath,
			label: basename(folder.uri.fsPath),
			description: folder.uri.fsPath,
		})),
	);
	return picked?.id;
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

const loadModel = async (
	deps: ICommandDeps,
	workspaceRoot: string,
	strings: ConfigurationCenterStrings,
) => {
	const tool = formatToolName(deps.namespacePrefix, 'configuration_center');
	const [document, config, summary, plugins, artifacts] = await Promise.all([
		readConfigurationDocument({ workspaceRoot }),
		deps.client.request<{ section: 'config' }, IConfigurationCenterResult>(
			tool,
			{ section: 'config' },
		),
		deps.client.request<{ section: 'summary' }, IConfigurationCenterResult>(
			tool,
			{ section: 'summary' },
		),
		readAll<IConfigurationPlugin>(deps, 'plugins', (page) => page.plugins),
		readAll<IConfigurationArtifact>(
			deps,
			'artifacts',
			(page) => page.artifacts,
		),
	]);
	if (config.configSchema === undefined) {
		throw new Error('configuration schema is unavailable');
	}
	return buildConfigurationCenterModel({
		document,
		copy: strings.copy,
		configSchema: config.configSchema,
		plugins,
		artifacts,
		unavailableArtifactKinds:
			summary.summary?.unavailableArtifactKinds ??
			([] as readonly ConfigurationArtifactKind[]),
	});
};

const renderPanel = async (
	deps: ICommandDeps,
	workspaceRoot: string,
	lang: Lang,
	strings: ConfigurationCenterStrings,
): Promise<string> =>
	withCsp(
		'configuration-center',
		injectBridge(
			renderConfigurationCenter({
				model: await loadModel(deps, workspaceRoot, strings),
				lang,
			}),
		),
	);

const resolveLang = (deps: ICommandDeps): Lang => {
	const persisted = deps.globalState?.get<unknown>(HOST_LANG_KEY);
	return typeof persisted === 'string' && persisted in dictsByLang
		? (persisted as Lang)
		: defaultLang;
};

export const registerOpenConfigurationCenterCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(
		OPEN_CONFIGURATION_CENTER_COMMAND,
		async () => {
			const lang = resolveLang(deps);
			const strings = configurationCenterStringsByLang[lang];
			const workspaceRoot = await selectWorkspace(deps, strings);
			if (workspaceRoot === undefined) return undefined;
			try {
				const panel = deps.vscode.window.createWebviewPanel(
					'mcpVertexConfigurationCenter',
					strings.panelTitle,
					deps.vscode.ViewColumn.One,
					{ enableScripts: true },
				);
				panel.webview.html = await renderPanel(
					deps,
					workspaceRoot,
					lang,
					strings,
				);
				panel.webview.onDidReceiveMessage?.(async (raw: unknown) => {
					try {
						const parsed =
							CONFIGURATION_CENTER_MESSAGE_SCHEMA.safeParse(raw);
						if (!parsed.success) {
							await deps.vscode.window.showErrorMessage?.(
								strings.invalidMessage,
							);
							return;
						}
						if (parsed.data.command === 'discardConfiguration') {
							panel.webview.html = await renderPanel(
								deps,
								workspaceRoot,
								lang,
								strings,
							);
							return;
						}
						const result = await saveConfigurationDocument({
							workspaceRoot,
							expectedDigest: parsed.data.expectedDigest,
							edits: parsed.data.edits,
						});
						if (!result.ok) {
							await panel.webview.postMessage?.(
								result.reason === 'conflict'
									? { command: 'configurationConflict' }
									: {
											command: 'configurationInvalid',
											issues: result.issues,
										},
							);
							return;
						}
						await panel.webview.postMessage?.({
							command: 'configurationSaved',
							digest: result.document.digest,
						});
						if (!result.changed) return;
						const action =
							await deps.vscode.window.showInformationMessage?.(
								`${strings.savedMessage} ${strings.copy.restartRequired}`,
								strings.restartAction,
							);
						if (
							action === strings.restartAction &&
							deps.vscode.commands.executeCommand !== undefined
						) {
							await deps.vscode.commands.executeCommand(
								RESTART_SERVER_COMMAND,
							);
						}
					} catch (error) {
						await panel.webview.postMessage?.({
							command: 'configurationInvalid',
						});
						await showCommandError(
							deps.vscode,
							strings.saveAction,
							error,
						);
					}
				});
				return panel;
			} catch (error) {
				await showCommandError(deps.vscode, strings.panelTitle, error);
				return undefined;
			}
		},
	);
