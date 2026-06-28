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

import { OPEN_PROPOSAL_COMMAND } from './open-proposal';
import { REFRESH_COMMAND } from './refresh';
import { HOST_LANG_KEY } from './setup-github';

export const OPEN_DASHBOARD_COMMAND = 'mcp-vertex.openDashboard';

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
}

const resolveLang = (deps: IOpenDashboardDeps): Lang => {
	const persisted = deps.globalState?.get<unknown>(HOST_LANG_KEY);
	return typeof persisted === 'string' && persisted in dictsByLang
		? (persisted as Lang)
		: defaultLang;
};

export const registerOpenDashboardCommand = (deps: IOpenDashboardDeps) =>
	deps.host.registerCommand(OPEN_DASHBOARD_COMMAND, async () => {
		const lang = resolveLang(deps);
		const dashboard = new DashboardService({ client: deps.client });
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
			if (typeof msg !== 'object' || msg === null) return;
			const m = msg as {
				command?: unknown;
				action?: unknown;
				id?: unknown;
			};
			if (m.command === 'action' && m.action === 'refresh') {
				try {
					await deps.host.executeCommand?.(REFRESH_COMMAND);
				} catch {
					// Best-effort: a missing executeCommand is a host
					// capability gap, not a user error.
				}
				return;
			}
			if (m.command === 'openProposal' && typeof m.id === 'string') {
				try {
					await deps.host.executeCommand?.(
						OPEN_PROPOSAL_COMMAND,
						m.id,
					);
				} catch {
					// Same: best-effort.
				}
			}
		});
		return panel;
	});
