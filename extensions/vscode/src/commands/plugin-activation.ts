/** VS Code adapter for the host-agnostic plugin activation switchboard. */
import {
	formatToolName,
	setPluginActivation,
	type ISetPluginActivationInput,
	type McpStdioClient,
} from '@delendai/client';
import {
	buildPluginSwitchboardModel,
	type IPluginActivationOverviewPayload,
	type IPluginSwitchboardReadyModel,
} from '@delendai/ui-extension/public';

import { defaultLang, dictsByLang, type Lang } from '../i18n';
import { pluginSwitchboardStringsByLang } from '../i18n/plugin-switchboard.strings';
import type { IPluginSwitchboardStrings } from '../contracts/interfaces/plugin-switchboard-strings.interface';
import { PLUGIN_ACTIVATION_COMMAND } from '../contracts/constants/plugin-activation-command.constant';
import { HOST_LANG_KEY } from './setup-github';
import type { ICommandDeps } from './types';
import { showCommandError } from './types';

interface IPluginActivationDeps extends ICommandDeps {
	readonly setActivation?: (
		input: ISetPluginActivationInput,
	) => Promise<unknown>;
}

const stringsFor = (deps: IPluginActivationDeps): IPluginSwitchboardStrings => {
	const persisted = deps.globalState?.get<unknown>(HOST_LANG_KEY);
	const lang: Lang =
		typeof persisted === 'string' && persisted in dictsByLang
			? (persisted as Lang)
			: defaultLang;
	return pluginSwitchboardStringsByLang[lang];
};

const fetchModel = async (
	client: McpStdioClient,
	prefix: string | undefined,
): Promise<IPluginSwitchboardReadyModel | undefined> => {
	const payload = await client.request<
		object,
		IPluginActivationOverviewPayload
	>(formatToolName(prefix, 'overview'), { compact: true, activation: true });
	const model = buildPluginSwitchboardModel(payload);
	return model.kind === 'ready' ? model : undefined;
};

export const registerPluginActivationCommand = (deps: IPluginActivationDeps) =>
	deps.vscode.commands.registerCommand(
		PLUGIN_ACTIVATION_COMMAND,
		async () => {
			try {
				const strings = stringsFor(deps);
				const model = await fetchModel(
					deps.client,
					deps.namespacePrefix,
				);
				if (model === undefined) {
					await deps.vscode.window.showInformationMessage?.(
						`delendai: ${strings.unavailable}`,
					);
					return;
				}
				const rows = model.groups.flatMap((group) => group.rows);
				const selected = await deps.vscode.window.showQuickPick?.(
					rows.map((row) => ({
						id: row.id,
						label: `${row.active ? '$(check)' : '$(circle-slash)'} ${row.id}`,
						description: `${strings[row.badge]} · ${
							row.active ? strings.enabled : strings.disabled
						} · ${row.toolCount} tools`,
						detail: `${row.active ? strings.disable : strings.enable} · ${row.source}`,
					})),
				);
				if (selected === undefined) return;
				const row = rows.find(
					(candidate) => candidate.id === selected.id,
				);
				if (row === undefined) return;
				const workspaceRoot =
					deps.vscode.workspace?.workspaceFolders?.[0]?.uri.fsPath;
				if (workspaceRoot === undefined) {
					await deps.vscode.window.showInformationMessage?.(
						`delendai: ${strings.noWorkspace}`,
					);
					return;
				}
				await (deps.setActivation ?? setPluginActivation)({
					workspaceRoot,
					id: row.id,
					origin: row.origin,
					active: row.nextActive,
				});
				const action =
					await deps.vscode.window.showInformationMessage?.(
						`delendai: ${strings.savedRestart}`,
						strings.restart,
					);
				if (action === strings.restart) {
					await deps.vscode.commands.executeCommand?.(
						'delendai.restartServer',
					);
				}
			} catch (error) {
				await showCommandError(
					deps.vscode,
					'change plugin activation',
					error,
				);
			}
		},
	);
