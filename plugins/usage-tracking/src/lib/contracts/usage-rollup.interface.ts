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

/** What one correct result cost, for one task class and model. */
export interface ICostPerCorrectRow {
	readonly taskClass: string;
	readonly model: string;
	/** Calls that carried a gate-set outcome. */
	readonly samples: number;
	readonly correct: number;
	readonly costUsd: number;
	readonly totalTokens: number;
	/** Null when nothing was correct: no honest figure exists. */
	readonly costPerCorrectUsd: number | null;
	readonly tokensPerCorrect: number | null;
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
	/** Cost per correct result by task class and model, with the sample count. */
	readonly costPerCorrect: readonly ICostPerCorrectRow[];
}
