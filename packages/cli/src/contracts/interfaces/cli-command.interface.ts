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
