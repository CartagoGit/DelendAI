import type { ICommandDeps } from './types';

export const REFRESH_COMMAND = 'mcp-vertex.refresh';

export const registerRefreshCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(REFRESH_COMMAND, async () => {
		deps.toolTree?.refresh();
		// f00097 S4: a global refresh also invalidates the proposals board
		// snapshot so the sidebar reflects the latest state.
		deps.proposalsTree?.refresh();
		await deps.vscode.window.showInformationMessage?.(
			'mcp-vertex refreshed',
		);
	});
