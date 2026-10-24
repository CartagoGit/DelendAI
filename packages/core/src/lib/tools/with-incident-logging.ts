/**
 * with-incident-logging.ts — f00154 S3.
 *
 * The opt-in adapter that turns every `toolError(...)` path into a
 * structured incident on the `logs` JSONL streams (or on the
 * `ConsoleLogsSink` when the `logs` plugin is not loaded).
 *
 * Usage (plugin side):
 *
 * ```ts
 * import { withIncidentLogging } from '@delendai/core/public';
 *
 * server.registerTool(
 *   'delendai_audit_plan',
 *   { description, inputSchema, outputSchema },
 *   withIncidentLogging(
 *     { incidentType: 'audit-failure' },
 *     async (args) => {
 *       // … return either a structured success envelope or a
 *       // `toolError(...)` result. The wrapper does not change the
 *       // return value the MCP SDK serialises — it just emits one
 *       // extra incident when the result is `isError: true`.
 *     },
 *   ),
 * );
 * ```
 *
 * The wrapper is **opt-out** at the registration level (set
 * `incidentLoggingDisabled: true` on the registration) and
 * **opt-in** at the tool level (the plugin chooses to wrap its
 * handler). The default is to wrap; the default `incidentType` is
 * `tool-failure`. Both decisions are deliberate: "every failed tool
 * surfaces an incident" is the only way the cross-plugin loop
 * closes, and the per-tool override is how `logs_incidents`
 * distinguishes source plugins.
 */

import type { ILogsSink, ISinkEvent } from '../plugins/plugin-contract';
import { sinkEventFromInput } from '../plugins/logs-sink';

export interface IWithIncidentLoggingOptions {
	/** Override the per-tool `incidentType` slug (default `tool-failure`). */
	readonly incidentType?: string;
	/** Default `error`. */
	readonly severity?:
		| 'debug'
		| 'info'
		| 'notice'
		| 'warning'
		| 'error'
		| 'critical'
		| 'alert'
		| 'emergency';
}

export interface IIncidentLoggingContext {
	/**
	 * The sink the wrapper publishes to. Resolved by the registration
	 * site (the plugin reads it from its `register()` ctx's
	 * `logsSink`). When absent the wrapper is a no-op — the
	 * tool-call still runs to completion and the error reaches the
	 * caller, but no incident is emitted.
	 */
	readonly logsSink?: ILogsSink;
}

/**
 * The shape the MCP SDK returns for a tool call. The wrapper only
 * inspects `isError` and a best-effort `error` field — it does not
 * look inside `content`/`structuredContent` to avoid coupling to
 * the SDK's serialisation rules.
 */
interface IToolResultLike {
	readonly isError?: boolean;
	readonly [key: string]: unknown;
}

const looksLikeErrorResult = (value: unknown): boolean => {
	if (value === null || typeof value !== 'object') return false;
	const v = value as IToolResultLike;
	return v.isError === true;
};

const extractErrorMessage = (value: unknown, toolName: string): string => {
	if (value === null || typeof value !== 'object') return 'tool error';
	const v = value as Record<string, unknown>;
	// `toolError` returns `{ ok: false, error: { code, issues, ... } }`,
	// wrapped by the SDK inside `{ isError, structuredContent }`. We look
	// in `value.error` first (legacy shape) then `value.structuredContent.error`
	// (current shape) so both work.
	const candidates: Array<Record<string, unknown> | undefined> = [
		v.error as Record<string, unknown> | undefined,
		(v.structuredContent as Record<string, unknown> | undefined)?.error as
			| Record<string, unknown>
			| undefined,
	];
	for (const err of candidates) {
		if (!err || typeof err !== 'object') continue;
		if (typeof err.code === 'string') return err.code;
		if (typeof err.message === 'string') return err.message;
	}
	if (typeof v.message === 'string') return v.message;
	return `tool-failed: ${toolName}`;
};

const extractFiles = (args: unknown): readonly string[] => {
	if (args === null || typeof args !== 'object') return [];
	const v = args as Record<string, unknown>;
	const out: string[] = [];
	if (Array.isArray(v.files)) {
		for (const f of v.files) {
			if (typeof f === 'string') out.push(f);
		}
	}
	if (typeof v.path === 'string') out.push(v.path);
	if (typeof v.file === 'string') out.push(v.file);
	if (typeof v.filePath === 'string') out.push(v.filePath);
	return out;
};

const extractAgent = (args: unknown): string | null => {
	if (args === null || typeof args !== 'object') return null;
	const v = args as Record<string, unknown>;
	if (typeof v.agent === 'string') return v.agent;
	if (typeof v.agentName === 'string') return v.agentName;
	return null;
};

/**
 * Wrap a tool handler so that, when it returns a result with
 * `isError: true`, the wrapper emits one incident on the supplied
 * sink. The original result is returned untouched, so the MCP wire
 * format is unchanged.
 */
export const withIncidentLogging = <TArgs, TResult>(
	options: IWithIncidentLoggingOptions,
	ctx: IIncidentLoggingContext,
	handler: (args: TArgs) => Promise<TResult>,
): ((args: TArgs) => Promise<TResult>) => {
	const incidentType = options.incidentType ?? 'tool-failure';
	const severity = options.severity ?? 'error';
	return async (args: TArgs): Promise<TResult> => {
		const result = await handler(args);
		if (!looksLikeErrorResult(result)) return result;
		if (ctx.logsSink === undefined) return result;
		const event = sinkEventFromInput(
			{
				severity,
				incidentType,
				message: extractErrorMessage(result, String(incidentType)),
				files: extractFiles(args),
				agent: extractAgent(args) ?? undefined,
				context: { args: args as Readonly<Record<string, unknown>> },
			},
			new Date().toISOString(),
		);
		try {
			await ctx.logsSink.record(event);
		} catch (sinkError) {
			// A sink failure must not propagate to the caller; the
			// tool error itself is still in `result`.
			process.stderr.write(
				`[delendai] logsSink.record failed: ${
					sinkError instanceof Error
						? sinkError.message
						: String(sinkError)
				}\n`,
			);
		}
		return result;
	};
};

/**
 * Convenience: build a sink-bound incident from a structured result
 * without wrapping a handler. Useful for plugins that build the
 * error envelope themselves (so the wrapper's auto-detection of
 * `isError: true` would be redundant) and want a one-line emit.
 */
export const emitIncident = async (
	sink: ILogsSink | undefined,
	options: IWithIncidentLoggingOptions,
	toolName: string,
	args: unknown,
	result: unknown,
): Promise<void> => {
	if (sink === undefined) return;
	if (!looksLikeErrorResult(result)) return;
	const event: ISinkEvent = sinkEventFromInput(
		{
			severity: options.severity ?? 'error',
			incidentType: options.incidentType ?? 'tool-failure',
			message: extractErrorMessage(result, toolName),
			files: extractFiles(args),
			agent: extractAgent(args) ?? undefined,
			context: {
				toolName,
				args: args as Readonly<Record<string, unknown>>,
			},
		},
		new Date().toISOString(),
	);
	try {
		await sink.record(event);
	} catch (sinkError) {
		process.stderr.write(
			`[delendai] emitIncident failed: ${
				sinkError instanceof Error
					? sinkError.message
					: String(sinkError)
			}\n`,
		);
	}
};
