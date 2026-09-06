import { redactSecrets } from '@delendai/core/public';

import {
	incidentTypeForKind,
	severityForOutcome,
	type LogSeverity,
} from './kinds';

export const LOG_OUTCOMES = [
	'ok',
	'failed',
	'timed-out',
	'cancelled',
	'dead',
	'idle',
	'unknown',
] as const;

export type LogOutcome = (typeof LOG_OUTCOMES)[number];

export type LogEventKind =
	| 'server-started'
	| 'tool-started'
	| 'tool-completed'
	| 'tool-failed'
	| 'tool-timed-out'
	| 'tool-cancelled'
	| 'agent-alive'
	| 'agent-idle'
	| 'agent-dead'
	| 'lock-claimed'
	| 'lock-released'
	| 'quality-run-started'
	| 'quality-run-finished'
	| 'quality-run-cancelled'
	| 'slice-submitted'
	| 'slice-approved'
	| 'slice-request-changes'
	| 'proposal-stale-detected'
	| 'state-repaired'
	| 'state-inconsistency-detected'
	| 'log-warning'
	// c00512 — the canonical kind for peer-emitted incidents (errors
	// captured by the IErrorSink port and routed through
	// error-sink-adapter). Distinct from `log-warning` so a model
	// pattern-matching on 'incident-error' (the documented contract
	// in plugins/logs/skills/*/SKILL.md) actually sees the events.
	// The discriminator pair (incidentType, severity) carries the
	// semantic meaning; the kind only identifies the source hook.
	| 'incident-error';

export interface ILogEvent {
	readonly ts: string;
	readonly kind: LogEventKind;
	readonly agent: string | null;
	readonly taskId: string | null;
	readonly outcome: LogOutcome;
	/**
	 * f00153 S1 — operator-facing severity from the syslog RFC 5424
	 * 8-level taxonomy (emergency → debug). `severityForOutcome(outcome)`
	 * is the default; callers can override via the `severity` field on
	 * `normalizeEvent`.
	 */
	readonly severity: LogSeverity;
	/**
	 * f00153 S1 — stable, lower-case incident code (e.g. `tool-failure`,
	 * `state-inconsistency`). Defaults to `KIND_TO_INCIDENT_TYPE[kind]`
	 * or `null` when the kind is unknown. `logs_log` callers can pin
	 * an arbitrary code in the `^[a-z][a-z0-9-]{0,63}$` slug shape.
	 */
	readonly incidentType: string | null;
	readonly files: readonly string[];
	readonly summary: string;
	readonly meta: Readonly<Record<string, unknown>>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null =>
	typeof value === 'string' && value.length > 0 ? value : null;

const asFiles = (value: unknown): readonly string[] =>
	Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === 'string')
		: [];

/**
 * Best-effort agent identity from a tool call's own arguments. Every
 * `onToolCall`/`onToolStart` hook only ever sees the raw args object —
 * core threads no session/agent id of its own — so this is the only
 * way `event.agent` (a first-class, filterable field on every query/
 * tail/correlate tool) ever gets populated for real tool-call events
 * instead of staying `null`. `agent`/`agentName` are the two parameter
 * names actually used across the tool surface (proposals, agent-lock,
 * etc.) — surveyed directly from the shipped Zod schemas.
 */
export const extractAgentHint = (args: unknown): string | null => {
	if (!isRecord(args)) return null;
	return asString(args.agent) ?? asString(args.agentName);
};

/**
 * Best-effort file paths touched by a tool call, read from its args
 * (the operation's target) and falling back to its result (for
 * read/scan tools that discover paths rather than take them as
 * input). Same rationale as {@link extractAgentHint}: `event.files`
 * is a first-class field every log tool already returns, but nothing
 * ever populated it. Parameter names surveyed from the shipped Zod
 * schemas: `files`/`paths` (arrays), `path`/`file`/`filePath`
 * (single strings).
 */
export const extractFilesHint = (
	args: unknown,
	result: unknown,
): readonly string[] => {
	const fromRecord = (record: unknown): readonly string[] => {
		if (!isRecord(record)) return [];
		const arrays = [...asFiles(record.files), ...asFiles(record.paths)];
		const singles = [
			asString(record.path),
			asString(record.file),
			asString(record.filePath),
		].filter((entry): entry is string => entry !== null);
		return [...arrays, ...singles];
	};
	const combined = [...fromRecord(args), ...fromRecord(result)];
	return [...new Set(combined)];
};

/**
 * True for any outcome that didn't cleanly reach the state we
 * expected — the definition of "worth a look" for the curated error
 * stream (`logs-errors/`). `idle` is a normal steady-state signal,
 * not an anomaly, so it's excluded alongside `ok`.
 */
export const isErrorOutcome = (outcome: LogOutcome): boolean =>
	outcome !== 'ok' && outcome !== 'idle';

export const outcomeForKind = (
	kind: LogEventKind,
	payload: Readonly<Record<string, unknown>>,
): LogOutcome => {
	const explicit = payload.outcome;
	if (
		typeof explicit === 'string' &&
		LOG_OUTCOMES.includes(explicit as LogOutcome)
	)
		return explicit as LogOutcome;
	if (kind.endsWith('failed')) return 'failed';
	if (kind.endsWith('timed-out')) return 'timed-out';
	if (kind.endsWith('cancelled')) return 'cancelled';
	if (kind.endsWith('dead')) return 'dead';
	if (kind.endsWith('idle')) return 'idle';
	if (kind.endsWith('completed') || kind.endsWith('finished')) return 'ok';
	if (
		kind === 'tool-started' ||
		kind === 'quality-run-started' ||
		kind === 'server-started'
	)
		return 'ok';
	return 'unknown';
};

export const normalizeEvent = (
	kind: LogEventKind,
	payload: unknown,
	now: Date = new Date(),
): ILogEvent => {
	const record = isRecord(payload) ? payload : { value: payload };
	const tool = asString(record.toolName) ?? asString(record.tool);
	const summarySource =
		asString(record.summary) ?? (tool ? `${kind}: ${tool}` : kind);
	const redactedSummary = redactSecrets(summarySource).text.slice(0, 200);
	const outcome = outcomeForKind(kind, record);
	return {
		ts: asString(record.ts) ?? now.toISOString(),
		kind,
		agent: asString(record.agent),
		taskId: asString(record.taskId) ?? asString(record.task) ?? tool,
		outcome,
		severity: severityForOutcome(outcome),
		incidentType: incidentTypeForKind(kind),
		files: asFiles(record.files),
		summary: redactedSummary,
		meta: record,
	};
};

export const serializeRedactedEvent = (
	event: ILogEvent,
	maxLineBytes = 8 * 1024,
): string => {
	const redactValue = (value: unknown): unknown => {
		if (typeof value === 'string') return redactSecrets(value).text;
		if (Array.isArray(value))
			return value.map((entry) => redactValue(entry));
		if (value && typeof value === 'object') {
			return Object.fromEntries(
				Object.entries(value).map(([key, entry]) => [
					key,
					redactValue(entry),
				]),
			);
		}
		return value;
	};
	let text = JSON.stringify(redactValue(event));
	if (Buffer.byteLength(text, 'utf8') <= maxLineBytes) return text;
	// f00111 S2: truncation must not destroy attribution — keep the
	// small identity fields so a truncated completion still pairs with
	// its `tool-started` line in any per-tool analysis. `callId` joins
	// `toolName`/`taskId` here for the same reason: it is the ONLY
	// field that disambiguates two concurrent calls to the same tool,
	// and losing it on exactly the large-payload events most likely to
	// need truncation would defeat its purpose.
	const metaTool = event.meta.toolName;
	const metaTask = event.meta.taskId;
	const metaCallId = event.meta.callId;
	const compact = {
		...event,
		summary: `${event.summary.slice(0, 180)}…`,
		meta: {
			__truncated__: true,
			originalBytes: Buffer.byteLength(text, 'utf8'),
			...(typeof metaTool === 'string' ? { toolName: metaTool } : {}),
			...(typeof metaTask === 'string' ? { taskId: metaTask } : {}),
			...(typeof metaCallId === 'string' ? { callId: metaCallId } : {}),
		},
	};
	text = JSON.stringify(redactValue(compact));
	while (
		Buffer.byteLength(text, 'utf8') > maxLineBytes &&
		compact.summary.length > 0
	) {
		compact.summary = compact.summary.slice(0, -16);
		text = JSON.stringify(redactValue(compact));
	}
	// For a pathological cap smaller than the attribution envelope itself,
	// returning that minimum envelope is safer than either losing tool/task
	// identity or looping forever. Production uses the 8 KiB default.
	return text;
};
