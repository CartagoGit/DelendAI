import { MetricsService } from '@mcp-vertex/client';

import { renderMetricsHtml } from '../views/metrics-sparkline';
import type { ICommandDeps } from './types';
import { showCommandError } from './types';

export const SHOW_METRICS_COMMAND = 'mcp-vertex.showMetrics';

export const registerShowMetricsCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(SHOW_METRICS_COMMAND, async () => {
		try {
			const snapshot = await new MetricsService(deps.client).snapshot();
			const panel = deps.vscode.window.createWebviewPanel(
				'mcpVertexMetrics',
				'mcp-vertex Metrics',
				deps.vscode.ViewColumn.One,
				{ enableScripts: false },
			);
			panel.webview.html = renderMetricsHtml(snapshot);
		} catch (err) {
			await showCommandError(deps.vscode, 'show metrics', err);
		}
	});
