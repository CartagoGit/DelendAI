import { MetricsService } from '@delendai/client';

import { renderMetricsHtml } from '../views/metrics-sparkline';
import { resolveViewLang, viewCopyFor } from '../i18n/view-copy.strings';
import type { ICommandDeps } from './types';
import { showCommandError } from './types';

export const SHOW_METRICS_COMMAND = 'delendai.showMetrics';

export const registerShowMetricsCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(SHOW_METRICS_COMMAND, async () => {
		try {
			const snapshot = await new MetricsService(deps.client).snapshot();
			const panel = deps.vscode.window.createWebviewPanel(
				'delendaiMetrics',
				'delendai Metrics',
				deps.vscode.ViewColumn.One,
				{ enableScripts: false },
			);
			panel.webview.html = renderMetricsHtml(
				snapshot,
				viewCopyFor(
					resolveViewLang(
						deps.globalState?.get<unknown>('delendai:lang'),
					),
				),
			);
		} catch (err) {
			await showCommandError(deps.vscode, 'show metrics', err);
		}
	});
