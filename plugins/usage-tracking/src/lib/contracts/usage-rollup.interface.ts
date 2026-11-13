export interface IInvocationTelemetryBucket {
	readonly key: string;
	readonly calls: number;
	readonly successfulCalls: number;
	readonly failedCalls: number;
	readonly retries: number;
	readonly iterationsObserved: number;
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly totalTokens: number;
	readonly costUsd: number;
	readonly averageLatencyMs: number | null;
	readonly p50LatencyMs: number | null;
	readonly p95LatencyMs: number | null;
	readonly lastSeenAt: string | null;
	readonly latestCorrelationId: string | null;
	readonly latestError: string | null;
}

export interface IInvocationTelemetryIssue {
	readonly ts: string;
	readonly plugin: string;
	readonly tool: string;
	readonly requestType: string;
	readonly outcome: string;
	readonly correlationId: string | null;
	readonly classification: string;
	readonly code: string;
	readonly message: string;
	readonly incongruence: boolean;
	readonly iteration: number | null;
}

export interface IInvocationTelemetryTotals {
	readonly calls: number;
	readonly successfulCalls: number;
	readonly failedCalls: number;
	readonly retries: number;
	readonly iterationsObserved: number;
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly totalTokens: number;
	readonly costUsd: number;
	readonly averageLatencyMs: number | null;
	readonly p50LatencyMs: number | null;
	readonly p95LatencyMs: number | null;
	readonly withCorrelation: number;
	readonly schemaIncongruences: number;
}

export interface IInvocationTelemetryRollup {
	readonly generatedAt: string;
	readonly windowDays: number;
	readonly totals: IInvocationTelemetryTotals;
	readonly byPlugin: readonly IInvocationTelemetryBucket[];
	readonly byTool: readonly IInvocationTelemetryBucket[];
	readonly byModel: readonly IInvocationTelemetryBucket[];
	readonly byAgent: readonly IInvocationTelemetryBucket[];
	readonly byRequestType: readonly IInvocationTelemetryBucket[];
	readonly byOutcome: readonly IInvocationTelemetryBucket[];
	readonly byError: readonly IInvocationTelemetryBucket[];
	readonly byDay: readonly IInvocationTelemetryBucket[];
	readonly issues: readonly IInvocationTelemetryIssue[];
}
