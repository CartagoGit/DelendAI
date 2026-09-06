/**
 * error-sink-adapter.ts — f00251 S3.
 *
 * Bridges the core `IErrorSink` port to the existing JSONL append path so
 * every `ICapturedError` fanned out by the error collector is also visible
 * in the logs-plugin's main + error streams without any schema migration.
 *
 * Key decisions:
 * - `sink.id = 'logs-error'` — distinguishes this sink from the lifecycle
 *   `logsSink` (`'logs-plugin'`) when the collector logs a fan-out failure.
 * - `kind = 'log-warning'` — the only existing `LogEventKind` that covers
 *   peer-emitted incidents; `'incident-error'` is not yet in the union.
 * - `outcome = 'failed'` — guarantees the event lands in BOTH the main
 *   stream and the curated error stream (`logs-errors/`) via `isErrorOutcome`.
 * - `ICapturedError.severity` and `LogSeverity` share the same 8-band
 *   RFC-5424 taxonomy, so the cast is bijective.
 * - Defense-in-depth: `redactSecrets` is applied to `summary` even though
 *   the collector already redacted the event — two cheap calls beat one
 *   missed secret at the boundary.
 * - Never throws: the try/catch ensures a failing `appendEvent` (e.g. disk
 *   full) never propagates into the collector's fan-out and crashes the
 *   calling tool.
 */

import { redactSecrets } from '@delendai/core/public';
import type { ICapturedError, IErrorSink } from '@delendai/core/public';

import type { LogSeverity } from './kinds';
import type { ILogEvent, LogOutcome } from './normalize-event';

export interface ICreateLogsErrorSinkAdapterOptions {
	/** The same `appendEvent` closure the logs plugin uses for lifecycle events. */
	readonly appendEvent: (event: ILogEvent) => Promise<void>;
}

export interface ILogsErrorSinkAdapterStats {
	readonly recordsAccepted: number;
	readonly recordsRejected: number;
}

export interface ILogsErrorSinkAdapter {
	readonly sink: IErrorSink;
	readonly getStats: () => ILogsErrorSinkAdapterStats;
}

// Both share the same 8-level RFC-5424 taxonomy; the cast is safe.
const toLogSeverity = (band: ICapturedError['severity']): LogSeverity =>
	band as LogSeverity;

const FIXED_OUTCOME: LogOutcome = 'failed';

export const createLogsErrorSinkAdapter = (
	options: ICreateLogsErrorSinkAdapterOptions,
): ILogsErrorSinkAdapter => {
	let recordsAccepted = 0;
	let recordsRejected = 0;

	const sink: IErrorSink = {
		id: 'logs-error',
		async record(event: ICapturedError): Promise<void> {
			try {
				// Defensive fallback: callers own schema validation, but
				// at the boundary we treat missing toolName as 'unknown'
				// so we never silently drop the event.
				const toolName: string =
					(event.toolName as string | undefined) ?? 'unknown';
				const redactedSummary = redactSecrets(event.summary).text;
				const logEvent: ILogEvent = {
					ts: event.ts,
					kind: 'incident-error',
					agent: (event.pluginName as string | undefined) ?? null,
					taskId: toolName,
					outcome: FIXED_OUTCOME,
					severity: toLogSeverity(event.severity),
					incidentType: toolName,
					files: [],
					summary: `incident-error: ${toolName} \u2014 ${redactedSummary.slice(0, 140)}`,
					meta: {
						errorCode: event.errorCode,
						classification: event.classification,
						fingerprint: event.fingerprint,
						errorName: event.errorName,
						stackHead: event.stackHead,
						sink: 'logs-error',
					},
				};
				await options.appendEvent(logEvent);
				recordsAccepted++;
			} catch (err) {
				recordsRejected++;
				process.stderr.write(
					`[logs-error-sink] adapter record failed: ${err instanceof Error ? err.message : String(err)}\n`,
				);
			}
		},
	};

	return {
		sink,
		getStats: () => ({
			recordsAccepted,
			recordsRejected,
		}),
	};
};
