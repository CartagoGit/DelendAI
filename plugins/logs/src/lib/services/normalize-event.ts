import { redactSecrets } from '@mcp-vertex/core/public';

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
	| 'log-warning';

export interface ILogEvent {
	readonly ts: string;
	readonly kind: LogEventKind;
	readonly agent: string | null;
	readonly taskId: string | null;
	readonly outcome: LogOutcome;
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
	if (kind === 'tool-started' || kind === 'quality-run-started') return 'ok';
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
	return {
		ts: asString(record.ts) ?? now.toISOString(),
		kind,
		agent: asString(record.agent),
		taskId: asString(record.taskId) ?? asString(record.task) ?? tool,
		outcome: outcomeForKind(kind, record),
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
	const compact = {
		...event,
		summary: `${event.summary.slice(0, 180)}…`,
		meta: {
			__truncated__: true,
			originalBytes: Buffer.byteLength(text, 'utf8'),
		},
	};
	text = JSON.stringify(redactValue(compact));
	while (Buffer.byteLength(text, 'utf8') > maxLineBytes) {
		compact.summary = compact.summary.slice(0, -16);
		text = JSON.stringify(redactValue(compact));
	}
	return text;
};
