import type { IExitCode } from '../constants/exit-code.constant';

export type IOutputFormat = 'json' | 'text';

export interface ICliGlobalOptions {
	readonly workspace: string;
	readonly remote?: string | undefined;
	readonly json: boolean;
	readonly format: IOutputFormat;
	readonly lang: string;
	readonly noColor: boolean;
	readonly plugins: readonly string[];
	readonly preset?: string | undefined;
	readonly config?: string | undefined;
	// r00003 S2 (F-001: declarative flag forwarding). Each entry is
	// optional on the global options surface; the forwarder table skips
	// undefined values, so the host never sees `--flag` for an unset
	// option. Defined on the interface (not added ad-hoc inside the
	// forwarder) so `keyof ICliGlobalOptions` covers every flag the
	// declarative table can declare.
	readonly cacheDir?: string | undefined;
	readonly docsDir?: string | undefined;
	readonly excludePlugins?: readonly string[] | undefined;
	readonly mcpProjectCreate?: boolean | undefined;
	readonly mcpProjectTests?: boolean | undefined;
	/**
	 * f00052: host-scoped `agent_worktree` gate. Tri-state — `undefined`
	 * (flag absent) forwards nothing so the host falls back to its file
	 * config / `false` default; `true`/`false` forward an explicit
	 * `--agent-worktree[=false]` so the host decision is unambiguous.
	 */
	readonly agentWorktree?: boolean | undefined;
}

export interface ICliCommandResult {
	readonly code: IExitCode;
	readonly data?: unknown;
	readonly text?: string | undefined;
	readonly error?: string | undefined;
}

export interface ICliCommandContext {
	readonly cwd: string;
	readonly globals: ICliGlobalOptions;
	request<TOut>(toolName: string, args: object): Promise<TOut>;
	listTools(): Promise<readonly ICliToolDescriptor[]>;
	close(): Promise<void>;
}

export interface ICliToolDescriptor {
	readonly name: string;
	readonly description?: string | undefined;
	readonly inputSchema?: unknown;
	readonly outputSchema?: unknown;
}

export interface ICliCommand {
	readonly name: string;
	readonly aliases?: readonly string[] | undefined;
	readonly summary: string;
	readonly usage?: string | undefined;
	run(
		args: readonly string[],
		ctx: ICliCommandContext,
	): Promise<ICliCommandResult>;
}

export interface IParsedCliInvocation {
	readonly globals: ICliGlobalOptions;
	readonly commandPath: readonly string[];
	readonly commandArgs: readonly string[];
	readonly help: boolean;
	readonly version: boolean;
}
