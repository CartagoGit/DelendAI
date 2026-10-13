/**
 * `delendai.openRoadmap` — opens the roadmap in a read-only panel.
 *
 * It asks the running server: the tool is found by what it is called for
 * (whatever prefix the project gave its tools), and a project that
 * declares no roadmap has no such tool — which is said, not treated as an
 * error.
 */
import { withCsp } from '@delendai/ui-extension/public';

import { asRoadmapView, renderRoadmapWebview } from '../webviews/roadmap';
import { OPEN_ROADMAP_COMMAND } from '../contracts/constants/roadmap-command.constant';
import type { ICommandDeps } from './types';

/** What the listing tool's name ends with, under any prefix. */
const SHOW_TOOL_SUFFIX = '_roadmap_show';

export const registerOpenRoadmapCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(OPEN_ROADMAP_COMMAND, async () => {
		const tool = (await deps.client.listTools()).find((each) =>
			each.name.endsWith(SHOW_TOOL_SUFFIX),
		);
		if (tool === undefined) {
			await deps.vscode.window.showInformationMessage?.(
				'delendai: this project declares no roadmap (plugins.roadmap.options.file).',
			);
			return undefined;
		}
		let view: ReturnType<typeof asRoadmapView>;
		try {
			view = asRoadmapView(await deps.client.request(tool.name, {}));
		} catch (error) {
			await deps.vscode.window.showErrorMessage?.(
				`delendai: the roadmap could not be read: ${error instanceof Error ? error.message : String(error)}`,
			);
			return undefined;
		}
		if (view === undefined) {
			await deps.vscode.window.showErrorMessage?.(
				'delendai: the roadmap tool answered in a shape this view does not read.',
			);
			return undefined;
		}
		const panel = deps.vscode.window.createWebviewPanel(
			'delendaiRoadmap',
			'delendai Roadmap',
			deps.vscode.ViewColumn.One,
			{ enableScripts: false },
		);
		panel.webview.html = withCsp('roadmap', renderRoadmapWebview(view));
		return panel;
	});
