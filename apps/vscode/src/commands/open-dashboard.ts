/**
 * `registerOpenDashboardCommand` — opens (or refreshes) the
 * `mcp-vertex Dashboard` webview. The dashboard's HTML is produced
 * by `@mcp-vertex/ide/public`'s `renderDashboard(...)`, fed by a
 * `DashboardService` over the same `McpStdioClient` used by every
 * other command.
 */
import {
	DashboardService,
	EmbedService,
	type McpStdioClient,
	resolveDocsUrl,
} from '@mcp-vertex/client';
import { renderDashboard } from '@mcp-vertex/ide/public';

import type { IHostAdapter } from '@mcp-vertex/ide/public';

import { REFRESH_COMMAND } from './refresh';

export const OPEN_DASHBOARD_COMMAND = 'mcp-vertex.openDashboard';

export interface IOpenDashboardDeps {
	readonly host: IHostAdapter;
	readonly client: McpStdioClient;
	readonly getConfig: () => {
		readonly extension?: { readonly docsUrl?: string };
	};
}

export const registerOpenDashboardCommand = (deps: IOpenDashboardDeps) =>
	deps.host.registerCommand(OPEN_DASHBOARD_COMMAND, async () => {
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
		return panel;
	});
