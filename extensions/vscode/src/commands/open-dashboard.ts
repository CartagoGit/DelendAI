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
	const openDashboardTab = async () => {
		const lang = resolveLang(deps);
		const dashboard = new DashboardService({
			client: deps.client,
			...(deps.namespacePrefix === undefined
				? {}
				: { namespacePrefix: deps.namespacePrefix }),
		});
		const embed = new EmbedService();
		let models;
		try {
			models = await dashboard.getAllModels();
		} catch {
			return undefined;
		}
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
			{ enableScripts: true, retainContextWhenHidden: true },
		);
		panel.webview.setHtml(html);
		panel.webview.onDidReceiveMessage?.(async (msg: unknown) => {
			const parsed = DASHBOARD_MESSAGE_SCHEMA.safeParse(msg);
			if (!parsed.success) return;
			if (parsed.data.command === 'action') {
				try {
					await deps.host.executeCommand?.(
						parsed.data.action === 'expand'
							? OPEN_DASHBOARD_TAB_COMMAND
							: REFRESH_COMMAND,
					);
				} catch {
					// Best-effort in reduced hosts.
				}
				return;
			}
			if (parsed.data.command === 'openTool') {
				await deps.host.executeCommand?.(
					OPEN_TOOL_DETAIL_COMMAND,
					parsed.data.name,
				);
				return;
			}
			if (parsed.data.command === 'openSurface') {
				const commands = {
					proposals: OPEN_PROPOSAL_COMMAND,
					knowledge: OPEN_KNOWLEDGE_COMMAND,
					configuration: OPEN_CONFIGURATION_CENTER_COMMAND,
					settings: OPEN_SETTINGS_COMMAND,
				} as const;
				await deps.host.executeCommand?.(commands[parsed.data.surface]);
				return;
			}
			await deps.host.executeCommand?.(
				OPEN_PROPOSAL_COMMAND,
				parsed.data.id,
			);
		});
		return panel;
	};
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
			await openDashboardTab();
		},
	);
	const tabRegistration = deps.host.registerCommand(
		OPEN_DASHBOARD_TAB_COMMAND,
		openDashboardTab,
	);
	return {
		dispose: () => {
			focusRegistration.dispose();
			tabRegistration.dispose();
		},
	};
};
