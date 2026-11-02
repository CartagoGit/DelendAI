/**
 * logs-sink.ts — f00154 S2.
 *
 * The contract between the core and **any** writer that wants to
 * receive tool-call lifecycle events (`tool-started` / `tool-completed` /
 * `tool-failed` / `tool-cancelled`).
 *
 * Two implementations ship in this module:
 *
 * - `LogsPluginSink` — a thin adapter that delegates to the
 *   `logs` plugin's `appendEvent`. The plugin's `register()` returns
 *   a private writer; we wrap it here so the core can inject the
 *   same sink the plugin itself uses, and so swapping the writer
 *   (e.g. for a test) is a one-line change at the `assemble` layer.
 *
 * - `ConsoleLogsSink` — always-available fallback. Writes one
 *   structured JSON line per event to stderr. The lines are
 *   redacted via the same `redactSecrets` helper the `logs` plugin
 *   uses, so a console sink never leaks credentials even if a
 *   plugin forgot to redact.
 *
 * The core always picks a sink at boot (in `assemble.ts`) — if the
 * `logs` plugin is in the load set, that; otherwise the console
 * fallback. The chosen sink is exposed to plugins via
 * `IMcpPluginContext.logsSink` so a plugin can call
 * `ctx.logsSink?.record(event)` directly without going through
 * `ctx.logs.log(...)` (which remains the preferred path for typed
 * input).
 *
 * The split between `ctx.logs` (typed helper, used by 99% of
 * plugin authors) and `ctx.logsSink` (raw writer, used by the
 * adapter and by the logs plugin itself) keeps the public surface
 * narrow while letting the core own the lifecycle plumbing.
 */

import { redactSecrets } from '../shared/redact';
import type { IPluginLogInput } from './plugin-contract';

/**
 * The shape every event landing in a sink carries. This is a
 * structurally-equivalent subset of `ILogEvent` (defined in
 * `plugins/logs`); we do **not** import the type to avoid a
 * cross-package dependency. The `logs` plugin's `LogsPluginSink`
 * normalises this shape into the canonical `ILogEvent` before
 * appending.
 */
export interface ISinkEvent {
	readonly ts: string;
	readonly kind: string;
	readonly outcome:
		| 'ok'
		| 'failed'
		| 'timed-out'
		| 'cancelled'
		| 'dead'
		| 'idle'
		| 'unknown';
	readonly severity:
		| 'debug'
		| 'info'
		| 'notice'
		| 'warning'
		| 'error'
		| 'critical'
		| 'alert'
		| 'emergency';
	readonly incidentType: string | null;
	readonly toolName: string | null;
	readonly taskId: string | null;
	readonly agent: string | null;
	readonly summary: string;
	readonly meta: Readonly<Record<string, unknown>>;
}

/**
 * The single contract the core uses to publish lifecycle events.
 * Implementations are expected to be safe to call from concurrent
 * tool invocations (the `logs` plugin's `appendEvent` already
 * serialises per-file via `withFileMutex`; the console sink writes
 * are atomic for ≤ `PIPE_BUF` bytes, which every line of ours is).
 */
export interface ILogsSink {
	/** Stable identifier for diagnostics. */
	readonly id: string;
	/**
	 * Persist or surface one event. Implementations MUST NOT throw
	 * — a sink failure is logged to stderr by the core and the
	 * tool call itself is unaffected.
	 */
	record(event: ISinkEvent): Promise<void>;
}

/**
 * f00154 S2 — the canonical writer behind the `logs` plugin. The
 * plugin constructs an instance of this with its own `appendEvent`
 * closure and passes it back to the core via the registration
 * return shape (see `assemble-plugins.ts`).
 */
export class LogsPluginSink implements ILogsSink {
	readonly id = 'logs-plugin';
	constructor(
		private readonly appendEvent: (event: {
			ts: string;
			kind: string;
			outcome: ISinkEvent['outcome'];
			severity: ISinkEvent['severity'];
			incidentType: string | null;
			agent: string | null;
			taskId: string | null;
			files: readonly string[];
			summary: string;
			meta: Readonly<Record<string, unknown>>;
		}) => Promise<void>,
	) {}

	async record(event: ISinkEvent): Promise<void> {
		await this.appendEvent({
			ts: event.ts,
			kind: event.kind,
			outcome: event.outcome,
			severity: event.severity,
			incidentType: event.incidentType,
			agent: event.agent,
			taskId: event.taskId,
			files: [],
			summary: event.summary,
			meta: event.meta,
		});
	}
}

/**
 * f00154 S2 — always-available fallback. One JSON line per event,
 * redacted, on stderr. Idempotent across processes; the line shape
 * is what `jq` parses natively (`ts`, `kind`, `outcome`, `severity`,
 * `incidentType`, `toolName`, `summary`).
 *
 * The `quiet` flag is set by the CLI when `--quiet` is on; it makes
 * the sink a no-op (the host wants no console noise at all, even on
 * the fallback path).
 */
export class ConsoleLogsSink implements ILogsSink {
	readonly id = 'console';
	constructor(private readonly options: { readonly quiet?: boolean } = {}) {}

	async record(event: ISinkEvent): Promise<void> {
		if (this.options.quiet) return;
		const redactedSummary = redactSecrets(event.summary).text;
		const redactedMeta = redactValue(event.meta);
		const line = JSON.stringify({
			ts: event.ts,
			kind: event.kind,
			outcome: event.outcome,
			severity: event.severity,
			incidentType: event.incidentType,
			toolName: event.toolName,
			taskId: event.taskId,
			agent: event.agent,
			summary: redactedSummary,
			meta: redactedMeta,
		});
		process.stderr.write(`${line}\n`);
	}
}

/**
 * f00154 S2 — translate a plugin's `IPluginLogInput` into the sink
 * event shape. Used by the `logs` plugin's `ctx.logs.log` helper
 * (which still exists) and by the `withIncidentLogging` adapter in
 * S3 to project plugin-emitted incidents into the same stream the
 * lifecycle hooks populate.
 */
export const sinkEventFromInput = (
	input: IPluginLogInput,
	ts: string,
): ISinkEvent => {
	const meta = (input.context ?? {}) as Readonly<Record<string, unknown>>;
	return {
		ts,
		kind: 'log-warning',
		outcome: severityToOutcome(input.severity),
		severity: input.severity,
		incidentType: input.incidentType,
		toolName: null,
		taskId: input.incidentType,
		agent: input.agent ?? null,
		summary: `incident-logged: ${input.incidentType} — ${input.message.slice(0, 140)}`,
		meta: {
			...meta,
			source: 'ctx.logs',
		},
	};
};

/**
 * f00154 S2 — the inverse of `severityForOutcome` (defined in
 * `plugins/logs`). The outcome drives which stream the event lands
 * in (the curated error stream lights up when `outcome !== 'ok' &&
 * outcome !== 'idle'`), so an `error`+ severity promotes the event
 * to the error stream and a `warning`/`notice`/`info` keeps it on
 * the main timeline only.
 */
const severityToOutcome = (
	severity: ISinkEvent['severity'],
): ISinkEvent['outcome'] => {
	if (
		severity === 'error' ||
		severity === 'critical' ||
		severity === 'alert' ||
		severity === 'emergency'
	) {
		return 'failed';
	}
	if (severity === 'warning') return 'unknown';
	if (severity === 'notice') return 'cancelled';
	return 'ok';
};

const redactValue = (value: unknown): unknown => {
	if (typeof value === 'string') return redactSecrets(value).text;
	if (Array.isArray(value)) return value.map(redactValue);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([k, v]) => [
				k,
				redactValue(v),
			]),
		);
	}
	return value;
};
