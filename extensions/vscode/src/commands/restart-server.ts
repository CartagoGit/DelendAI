/**
 * `mcp-vertex.restartServer` — re-spawns the MCP server. Used by the
 * connection-health status bar when the stdio drops and the user
 * clicks the "Restart" action on the toast.
 *
 * The default implementation just shows an info message (the actual
 * restart requires host-specific knowledge, like a VS Code task or
 * a JetBrains process restart). Hosts can override by passing a
 * custom `restartFn` to the activation.
 */
import type { ICommandVscodeApi } from './types';

export const RESTART_SERVER_COMMAND = 'mcp-vertex.restartServer';

export interface IRestartServerOptions {
	/** Custom restart function (e.g. spawn a new stdio process). */
	readonly restartFn?: () => Promise<void>;
}

export const registerRestartServerCommand = (
	vscode: ICommandVscodeApi,
	options: IRestartServerOptions = {},
) =>
	vscode.commands.registerCommand(RESTART_SERVER_COMMAND, async () => {
		if (options.restartFn) {
			await options.restartFn();
			await vscode.window.showInformationMessage?.(
				'mcp-vertex: server restarted.',
			);
			return;
		}
		// Default: tell the user to restart manually.
		await vscode.window.showInformationMessage?.(
			'mcp-vertex: please restart the extension or reload the window to re-spawn the MCP server.',
		);
	});
