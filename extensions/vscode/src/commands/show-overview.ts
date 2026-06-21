import { OverviewService } from '@mcp-vertex/client';

import { SHOW_OVERVIEW_COMMAND } from '../extension';
import type { ICommandDeps } from './types';
import { renderJsonHtml } from './types';

export const registerShowOverviewCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(SHOW_OVERVIEW_COMMAND, async () => {
		const overview = await new OverviewService(deps.client).getOverview({
			compact: false,
		});
		const panel = deps.vscode.window.createWebviewPanel(
			'mcpVertexOverview',
			'mcp-vertex Overview',
			deps.vscode.ViewColumn.One,
			{ enableScripts: false },
		);
		panel.webview.html = renderJsonHtml('mcp-vertex Overview', overview);
	});
