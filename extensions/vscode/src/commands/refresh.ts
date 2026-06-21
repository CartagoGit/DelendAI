import type { ICommandDeps } from './types';

export const REFRESH_COMMAND = 'mcp-vertex.refresh';

export const registerRefreshCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(REFRESH_COMMAND, async () => {
		deps.toolTree?.refresh();
		await deps.vscode.window.showInformationMessage?.(
			'mcp-vertex refreshed',
		);
	});
