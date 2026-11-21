import type { ICliContextOpener } from '../contracts/interfaces/lazy-context.interface';
import type {
	ICliCommandContext,
	ICliGlobalOptions,
} from '../contracts/interfaces/cli-command.interface';

/**
 * A context that starts its MCP server at the first tool call.
 *
 * Measured on a fixture, `delendai work status` took 3.3 s against 0.5 s
 * for `--version`: the CLI spawned a server before the command ran, and
 * the command (the unit engine runs in this process) never asked it
 * anything. The server is now the cost of the commands that call a tool,
 * and only of those; a command that refuses its arguments or answers from
 * git pays nothing.
 */
/**
 * How a context opens its server: the stdio client is imported here, at
 * the first tool call, so a command that never calls one never loads it.
 */
export const serverOpener =
	(
		cwd: string,
		globals: ICliGlobalOptions,
		extraPlugins: readonly string[],
	): ICliContextOpener =>
	async () => {
		const { createStdioContext } = await import('./stdio-context.factory');
		return createStdioContext(cwd, globals, extraPlugins);
	};

export const createLazyContext = (
	cwd: string,
	globals: ICliGlobalOptions,
	open: ICliContextOpener,
): ICliCommandContext => {
	let opened: Promise<ICliCommandContext> | undefined;
	const server = (): Promise<ICliCommandContext> => {
		opened ??= open();
		return opened;
	};
	return {
		cwd,
		globals,
		request: async <TOut>(toolName: string, args: object) =>
			(await server()).request<TOut>(toolName, args),
		listTools: async () => (await server()).listTools(),
		close: async () => {
			if (opened === undefined) return;
			await (await opened.catch(() => undefined))?.close();
		},
	};
};
