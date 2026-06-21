/**
 * Typed models for the Logs panel. Mirrors the server's
 * `<prefix>_logs_*` output schemas (f00015).
 */

export type ILogOutcome =
	| 'ok'
	| 'failed'
	| 'timed-out'
	| 'cancelled'
	| 'dead'
	| 'idle'
	| 'unknown';

export interface ILogEvent {
	readonly ts: string;
	readonly kind: string;
	readonly agent: string | null;
	readonly taskId: string | null;
	readonly outcome: ILogOutcome;
	readonly files: readonly string[];
	readonly summary: string;
	readonly meta: Readonly<Record<string, unknown>>;
}

export interface ILogQueryFilter {
	readonly since?: string;
	readonly until?: string;
	readonly kind?: string;
	readonly agent?: string;
	readonly taskId?: string;
	readonly outcome?: ILogOutcome;
	readonly limit?: number;
	readonly cursor?: string;
}

export interface ILogQueryResult {
	readonly events: readonly ILogEvent[];
	readonly cursor: string | null;
	readonly hasMore: boolean;
}

export interface ILogTailResult {
	readonly events: readonly ILogEvent[];
	readonly oldestTs: string | null;
}

export interface ILogCorrelateResult {
	readonly chain: readonly ILogEvent[];
	readonly firstTs: string | null;
	readonly lastTs: string | null;
	readonly gaps: readonly {
		readonly startTs: string;
		readonly endTs: string;
		readonly durationMs: number;
	}[];
}

export interface ILogRedactionTestResult {
	readonly detected: readonly string[];
	readonly redacted: string;
}

/** Options for `LogsService.subscribe`. */
export interface ILogSubscribeOptions {
	readonly signal?: AbortSignal;
	readonly pollIntervalMs?: number;
	/** Stop after this many events (capped at 1000). */
	readonly maxEvents?: number;
	/** Filter passed to the underlying `logs_subscribe` tool. */
	readonly filter?: ILogQueryFilter;
}

/** Notification event paired with a recent tool call (correlation). */
export interface INotificationLogEntry {
	readonly ts: string;
	readonly event: 'lock-released' | 'cap' | 'bloqueado';
	readonly message: string;
	readonly taskId?: string;
	/** Tool calls (from `MetricsService`) that happened within ±5s. */
	readonly correlatedToolCalls: readonly {
		readonly tool: string;
		readonly ts: string;
		readonly durationMs: number;
	}[];
}
