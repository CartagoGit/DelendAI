import type { IDelendaiToolOutputs } from '@delendai/client';

import type { ICommandDeps } from './types';
import { renderJsonHtml, showCommandError } from './types';

export const ADOPT_COMMAND = 'delendai.adopt';

const ADOPT_PROJECT_TOOL = 'delendai_adopt_project';

/**
 * `delendai.adopt` — shows what adopting delendai would change in the open
 * workspace. It is reachable before the project has a `delendai.config.json`,
 * so it only ever asks the server for an assessment (`analyze`) and never
 * passes `write`: nothing on disk changes until the user runs the CLI
 * equivalent on purpose.
 */
export const registerAdoptCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(ADOPT_COMMAND, async () => {
		try {
			const plan = await deps.client.request<
				{ analyze: true },
				IDelendaiToolOutputs['delendai_adopt_project']
			>(ADOPT_PROJECT_TOOL, { analyze: true });
			const panel = deps.vscode.window.createWebviewPanel(
				'delendaiAdopt',
				'delendai Adoption Plan',
				deps.vscode.ViewColumn.One,
				{ enableScripts: false },
			);
			panel.webview.html = renderJsonHtml('delendai Adoption Plan', plan);
		} catch (err) {
			await showCommandError(deps.vscode, 'adopt project', err);
		}
	});
