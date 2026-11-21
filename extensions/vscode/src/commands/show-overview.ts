import { OverviewService } from '@delendai/client';

import { SHOW_OVERVIEW_COMMAND } from '../extension';
import type { ICommandDeps } from './types';
import { renderJsonHtml, showCommandError } from './types';

export const registerShowOverviewCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(SHOW_OVERVIEW_COMMAND, async () => {
		try {
			const overview = await new OverviewService(
				deps.client,
				deps.namespacePrefix,
			).getOverview({
				compact: true,
			});
			const panel = deps.vscode.window.createWebviewPanel(
				'delendaiOverview',
				'delendai Overview',
				deps.vscode.ViewColumn.One,
				{ enableScripts: false },
			);
			panel.webview.html = renderJsonHtml('delendai Overview', overview);
		} catch (err) {
			await showCommandError(deps.vscode, 'show overview', err);
		}
	});
