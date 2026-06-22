/**
 * `LogsService` — client-side wrapper around the `<prefix>_logs_*`
 * family of tools. Exposes a tiny, IDE-friendly surface for:
 *
 * - `query(filter)` — paginated log query.
 * - `tail(n, filter)` — most recent N events.
 * - `subscribe(opts)` — `AsyncIterable<ILogEvent>` that polls
 *   `logs_subscribe` every `pollIntervalMs` (default 2s) until the
 *   `AbortSignal` fires. Yields each event **once**.
 * - `correlate(filter)` — chronological chain for one task or agent.
 * - `redactTest(payload)` — audit the redactor against a sample.
 *
 * Secrets in every payload are run through `redactSecretsSync` before
 * being returned to callers (matches the server-side redactor; we
 * re-implement the regex set in the client to avoid pulling the
 * `logs` plugin into the runtime).
 */
import { redactSecrets } from '@mcp-vertex/core/public';

import type { McpStdioClient } from '../transport/mcp-stdio-client';
import type {
	ILogCorrelateResult,
	ILogEvent,
	ILogQueryFilter,
	ILogQueryResult,
	ILogRedactionTestResult,
	ILogSubscribeOptions,
	ILogTailResult,
} from './logs.types';

const TOOL_QUERY = 'logs_query';
const TOOL_TAIL = 'logs_tail';
const TOOL_SUBSCRIBE = 'logs_subscribe';
const TOOL_CORRELATE = 'logs_correlate';
const TOOL_REDACT_TEST = 'logs_redact_test';

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const MAX_EVENTS = 1_000;

export class LogsService {
	constructor(private readonly client: McpStdioClient) {}

	async query(filter: ILogQueryFilter = {}): Promise<ILogQueryResult> {
		const out = await this.client.request<ILogQueryFilter, ILogQueryResult>(
			TOOL_QUERY,
			filter,
		);
		return {
			events: out.events.map(redactEvent),
			cursor: out.cursor,
			hasMore: out.hasMore,
		};
	}

	async tail(
		limit = 50,
		filter: ILogQueryFilter = {},
	): Promise<ILogTailResult> {
		const out = await this.client.request<
			{ limit: number } & ILogQueryFilter,
			ILogTailResult
		>(TOOL_TAIL, { limit, ...filter });
		return {
			events: out.events.map(redactEvent),
			oldestTs: out.oldestTs,
		};
	}

	async correlate(
		filter: ILogQueryFilter & {
			readonly taskId?: string;
			readonly agent?: string;
		},
	): Promise<ILogCorrelateResult> {
		const out = await this.client.request<
			typeof filter,
			ILogCorrelateResult
		>(TOOL_CORRELATE, filter);
		return {
			chain: out.chain.map(redactEvent),
			firstTs: out.firstTs,
			lastTs: out.lastTs,
			gaps: out.gaps,
		};
	}

	async redactTest(payload: string): Promise<ILogRedactionTestResult> {
		return await this.client.request<
			{ payload: string },
			ILogRedactionTestResult
		>(TOOL_REDACT_TEST, { payload });
	}

	/**
	 * Poll `logs_subscribe` every `pollIntervalMs` and yield new
	 * events. Stops on `signal.abort`. Deduplicates by `ts + summary`
	 * so a slow consumer doesn't see the same event twice. Caps at
	 * `maxEvents` events (default 1000) to avoid runaway memory.
	 */
	async *subscribe(
		options: ILogSubscribeOptions = {},
	): AsyncIterable<ILogEvent> {
		const signal = options.signal;
		const pollIntervalMs =
			options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
		const maxEvents = options.maxEvents ?? MAX_EVENTS;
		const seen = new Set<string>();
		let yielded = 0;
		while (signal?.aborted !== true && yielded < maxEvents) {
			const out = await this.client.request<
				ILogQueryFilter | Record<string, never>,
				{
					readonly events: readonly ILogEvent[];
					readonly stream: 'logs';
				}
			>(TOOL_SUBSCRIBE, options.filter ?? {});
			for (const raw of out.events) {
				if (yielded >= maxEvents) return;
				const ev = redactEvent(raw);
				const key = `${ev.ts}|${ev.summary}`;
				if (seen.has(key)) continue;
				seen.add(key);
				yielded += 1;
				yield ev;
			}
			if (signal?.aborted) return;
			await wait(pollIntervalMs, signal);
		}
	}
}

const wait = async (ms: number, signal?: AbortSignal): Promise<void> => {
	if (signal?.aborted) return;
	await new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				resolve();
			},
			{ once: true },
		);
	});
};

const redactEvent = (ev: ILogEvent): ILogEvent => ({
	ts: ev.ts,
	kind: ev.kind,
	agent: ev.agent,
	taskId: ev.taskId,
	outcome: ev.outcome,
	files: ev.files,
	summary: redactSecrets(ev.summary).text,
	meta: redactMeta(ev.meta),
});

const redactMeta = (
	meta: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(meta)) {
		out[k] = typeof v === 'string' ? redactSecrets(v).text : v;
	}
	return out;
};
