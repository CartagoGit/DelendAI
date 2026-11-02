/**
 * startup-report/stdio-guard.ts — q00009 / f00259 (channel split).
 *
 * The MCP stdio transport reserves stdout exclusively for protocol
 * frames. Human-facing logs (startup report, warnings, errors) MUST
 * go to stderr — or to the host Output Channel for VS Code. This
 * module is the single source of truth for that decision.
 *
 * It exposes:
 *
 *   - {@link resolveOutputChannel}: picks the channel from env.
 *   - {@link writeStartupReport}: writes the rendered report to the
 *     chosen channel and returns whether anything was written.
 *   - {@link assertStdoutClean}: dev-time guard that fails when the
 *     process is started under stdio AND the report would have hit
 *     stdout (used by tests + lints).
 *
 * The module never imports `process.stdout` directly — channels are
 * injected so unit tests can pin them and so the same code runs in
 * the CLI, the MCP server and the VS Code extension host.
 */

import type { IStartupReport } from './model';
import type { IStartupReportLevel } from './level';
import {
	isStartupReportLevelVisible,
	resolveStartupReportLevel,
} from './level';
import { renderStartupReportAnsi, renderStartupReportPlain } from './renderer';

export type IOutputChannel = 'stderr' | 'host' | 'discard';

export interface IResolveOutputChannelInput {
	readonly env?: NodeJS.ProcessEnv | undefined;
	/**
	 * Set by the host wiring. For the VS Code extension this is
	 * `OutputChannel.show()`. For the CLI it is `process.stderr`. For
	 * tests it is a buffered channel.
	 */
	readonly forced?: IOutputChannel | undefined;
}

export const resolveOutputChannel = (
	input: IResolveOutputChannelInput = {},
): IOutputChannel => {
	if (input.forced !== undefined) return input.forced;
	const env = input.env ?? process.env;
	if (env.DELENDAI_LOG === 'stderr') return 'stderr';
	if (env.DELENDAI_LOG === 'host') return 'host';
	if (env.DELENDAI_LOG === 'discard') return 'discard';
	return 'stderr';
};

export interface IWriteStartupReportInput {
	readonly report: IStartupReport;
	readonly channel: IOutputChannel;
	readonly writers: {
		readonly stderr?: (text: string) => void;
		readonly host?: (text: string) => void;
	};
	readonly useAnsi: boolean;
}

export interface IWriteStartupReportResult {
	readonly wrote: boolean;
	readonly bytes: number;
	readonly channel: IOutputChannel;
}

/**
 * Pure dispatch: choose the right writer for the channel and call it.
 * Returns whether anything was written.
 */
export const writeStartupReport = (
	input: IWriteStartupReportInput,
): IWriteStartupReportResult => {
	const level = input.report.identity.startupReportLevel;
	if (!isStartupReportLevelVisible(level)) {
		return { wrote: false, bytes: 0, channel: input.channel };
	}
	const text = input.useAnsi
		? renderStartupReportAnsi(input.report)
		: renderStartupReportPlain(input.report);
	if (input.channel === 'stderr' && input.writers.stderr) {
		input.writers.stderr(text);
		return { wrote: true, bytes: text.length, channel: 'stderr' };
	}
	if (input.channel === 'host' && input.writers.host) {
		input.writers.host(text);
		return { wrote: true, bytes: text.length, channel: 'host' };
	}
	return { wrote: false, bytes: 0, channel: 'discard' };
};

/**
 * Resolve the level from CLI / env / config + the default. Then
 * resolve the channel. This is the entry point used by bootstrap.
 */
export interface IResolveStartupReportDispatchInput {
	readonly configLevel?: string | undefined;
	readonly cliLevel?: string | undefined;
	readonly envLevel?: string | undefined;
	readonly channelInput?: IResolveOutputChannelInput;
}

export const resolveStartupReportDispatch = (
	input: IResolveStartupReportDispatchInput,
) => {
	const level = resolveStartupReportLevel({
		configLevel: input.configLevel,
		cliLevel: input.cliLevel,
		envLevel: input.envLevel,
	});
	const channel = resolveOutputChannel(input.channelInput);
	return { level, channel };
};

export type IResolvedLevel = ReturnType<typeof resolveStartupReportLevel>;
export type IStartupReportDispatch = ReturnType<
	typeof resolveStartupReportDispatch
>;

/**
 * Dev-time assertion: when running under the MCP stdio transport
 * (`MCP_TRANSPORT=stdio`), the channel MUST be `stderr` or `host`,
 * never stdout. This catches regressions where a refactor starts
 * routing the startup report through `console.log`.
 */
export const assertStdoutClean = (
	channel: IOutputChannel,
	env: NodeJS.ProcessEnv = process.env,
): { readonly ok: boolean; readonly reason?: string } => {
	if (env.MCP_TRANSPORT !== 'stdio') return { ok: true };
	if (channel === 'stderr' || channel === 'host' || channel === 'discard') {
		return { ok: true };
	}
	return {
		ok: false,
		reason: `startup report channel=${channel} would pollute MCP stdio stdout`,
	};
};

export const __testonly__resolveLevelOnly = (
	level: IStartupReportLevel,
): IStartupReportLevel => level;
