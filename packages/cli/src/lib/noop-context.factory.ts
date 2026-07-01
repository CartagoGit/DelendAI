/**
 * f00084 — noop MCP context for commands that do not need a sub-server.
 *
 * `init` writes files; it never invokes a tool. Wiring it through
 * `createStdioContext` would spawn a sub-bun process per call, which:
 *
 *   1. Costs ~150 ms of boot per invocation.
 *   2. Breaks when the destination project does not contain
 *      `packages/cli/src/index.ts` (the sub-process exits with
 *      "Connection closed" before the parent can use it).
 *   3. Adds no value — `init` only reads `ctx.cwd` and `ctx.globals`.
 *
 * `createNoopContext` mirrors the `ICliCommandContext` shape but
 * refuses every `request()` with a typed error and returns an empty
 * tool list. `init` is the only caller; the rest of the CLI keeps
 * using `createStdioContext` for the runtime surface.
 */
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommandContext,
	ICliGlobalOptions,
	ICliToolDescriptor,
} from '../contracts/interfaces/cli-command.interface';

export const createNoopContext = (
	cwd: string,
	globals: ICliGlobalOptions,
): ICliCommandContext => ({
	cwd,
	globals,
	request: <TOut>() => {
		throw Object.assign(
			new Error(
				'this command does not invoke MCP tools; no client is wired',
			),
			{ code: EXIT_CODE.USAGE },
		) as Error & { code: number };
	},
	listTools: async (): Promise<readonly ICliToolDescriptor[]> => [],
	close: async () => {
		// Nothing to close.
	},
});
