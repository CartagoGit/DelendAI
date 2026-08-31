/**
 * `registerOpenDashboardCommand` — opens (or refreshes) the
 * `mcp-vertex Dashboard` webview. The dashboard's HTML is produced
 * by `@mcp-vertex/ui-extension/public`'s `renderDashboard(...)`, fed
 * by a `DashboardService` over the same `McpStdioClient` used by
 * every other command.
 */
import {
	DashboardService,
	EmbedService,
	type McpStdioClient,
} from '@mcp-vertex/client';
import { defaultLang, dictsByLang, type Lang } from '../i18n';
import { renderDashboard } from '@mcp-vertex/ui-extension/public';

import type { IHostAdapter } from '@mcp-vertex/ui-extension/public';

import { DASHBOARD_MESSAGE_SCHEMA } from '../contracts/constants/dashboard-message-schema.constant';
import { OPEN_PROPOSAL_COMMAND } from './open-proposal';
import { OPEN_TOOL_DETAIL_COMMAND } from '../contracts/constants/open-tool-detail-command.constant';
import { OPEN_KNOWLEDGE_COMMAND } from './open-knowledge';
import { OPEN_SETTINGS_COMMAND } from './open-settings';
import { OPEN_CONFIGURATION_CENTER_COMMAND } from './open-configuration-center';
import { REFRESH_COMMAND } from './refresh';
import { HOST_LANG_KEY } from './setup-github';

export const OPEN_DASHBOARD_COMMAND = 'mcp-vertex.openDashboard';
export const OPEN_DASHBOARD_TAB_COMMAND = 'mcp-vertex.openDashboardTab';

export interface IOpenDashboardDeps {
	readonly host: IHostAdapter;
	readonly client: McpStdioClient;
	readonly globalState?: {
		get<T>(key: string): T | undefined;
		update(key: string, value: unknown): Thenable<void> | Promise<void>;
	};
	readonly getConfig: () => {
		readonly extension?: { readonly docsUrl?: string };
	};
	/** Host namespace prefix (f00081 S2). Threaded into the
	 * `DashboardService` so a non-default `--prefix` deployment resolves
	 * `<prefix>_*` tools. */
	readonly namespacePrefix?: string;
}

const resolveLang = (deps: IOpenDashboardDeps): Lang => {
	const persisted = deps.globalState?.get<unknown>(HOST_LANG_KEY);
	return typeof persisted === 'string' && persisted in dictsByLang
		? (persisted as Lang)
		: defaultLang;
};

export const registerOpenDashboardCommand = (deps: IOpenDashboardDeps) => {
	const focusRegistration = deps.host.registerCommand(
		OPEN_DASHBOARD_COMMAND,
		async () => {
			if (deps.host.executeCommand !== undefined) {
				await deps.host.executeCommand(
					'workbench.view.extension.mcp-vertex',
				);
				await deps.host.executeCommand('workbench.action.focusView', {
					viewId: 'mcp-vertex.dashboard',
				});
				return;
			}
			await deps.host.executeCommand?.(OPEN_DASHBOARD_TAB_COMMAND);
		},
	);
	const tabRegistration = deps.host.registerCommand(
		OPEN_DASHBOARD_TAB_COMMAND,
		async () => {
			const lang = resolveLang(deps);
			const dashboard = new DashboardService({
				client: deps.client,
				...(deps.namespacePrefix === undefined
					? {}
					: { namespacePrefix: deps.namespacePrefix }),
			});
			const embed = new EmbedService();
			const models = await dashboard.getAllModels();
			const docsUrl = (() => {
				try {
					return embed.resolve(deps.getConfig()).url;
				} catch {
					return 'https://mcp-vertex.dev';
				}
			})();
			const html = renderDashboard(models, {
				docsUrl,
				refreshCommand: REFRESH_COMMAND,
				openDocsCommand: OPEN_DASHBOARD_COMMAND,
				lang: dictsByLang[lang],
			});
			const panel = deps.host.createWebviewPanel(
				'mcpVertexDashboard',
				'mcp-vertex Dashboard',
				1,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
				},
			);
			panel.webview.setHtml(html);
			// FIX (D1) + (D2): wire the message bridge so the ⟳ tab posts
			// `{command:'action',action:'refresh'}` (resolved to the host's
			// REFRESH_COMMAND) and `<a data-proposal="...">` rows in the
			// Agents/Sessions panels open the matching proposal. Without
			// this listener both gestures were silent no-ops.
			panel.webview.onDidReceiveMessage?.(async (msg: unknown) => {
				const parsed = DASHBOARD_MESSAGE_SCHEMA.safeParse(msg);
				if (!parsed.success) return;
				if (parsed.data.command === 'action') {
					try {
						await deps.host.executeCommand?.(
							parsed.data.action === 'expand'
								? OPEN_DASHBOARD_COMMAND
								: REFRESH_COMMAND,
						);
					} catch {
						// Best-effort: a missing executeCommand is a host
						// capability gap, not a user error.
					}
					return;
				}
				if (parsed.data.command === 'openTool') {
					try {
						await deps.host.executeCommand?.(
							OPEN_TOOL_DETAIL_COMMAND,
							parsed.data.name,
						);
					} catch {
						// Best-effort: the detail command may be unavailable in a reduced host.
					}
					return;
				}
				if (parsed.data.command === 'openSurface') {
					const commands = {
						proposals: OPEN_PROPOSAL_COMMAND,
						knowledge: OPEN_KNOWLEDGE_COMMAND,
						configuration: OPEN_CONFIGURATION_CENTER_COMMAND,
						settings: OPEN_SETTINGS_COMMAND,
					} as const;
					try {
						await deps.host.executeCommand?.(
							commands[parsed.data.surface],
						);
					} catch {
						// Best-effort in reduced hosts.
					}
					return;
				}
				try {
					await deps.host.executeCommand?.(
						OPEN_PROPOSAL_COMMAND,
						parsed.data.id,
					);
				} catch {
					// Same: best-effort.
				}
			});
			return panel;
		},
	);
	return {
		dispose: () => {
			focusRegistration.dispose();
			tabRegistration.dispose();
		},
	};
};
