import { redactSecrets } from '@delendai/core/public';

import { buildRecord, resolveSessionId } from '../record';
import type {
	IBuildInvocationRecordInput,
	IInvocationCorrelation,
	IInvocationErrorTelemetry,
	IInvocationRecordTelemetry,
	InvocationErrorClassification,
	InvocationRequestType,
} from '../contracts/invocation-record.interface';

const asRecord = (value: unknown): Record<string, unknown> | null =>
	value && typeof value === 'object'
		? (value as Record<string, unknown>)
		: null;

const asString = (value: unknown): string | undefined =>
	typeof value === 'string' ? value : undefined;

const asBoolean = (value: unknown): boolean | undefined =>
	typeof value === 'boolean' ? value : undefined;

const asFiniteInt = (value: unknown): number | undefined => {
	if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
	const normalized = Math.trunc(value);
	return normalized >= 0 ? normalized : undefined;
};

const structuredOf = (value: unknown): Record<string, unknown> | null => {
	const root = asRecord(value);
	if (!root) return null;
	return asRecord(root.structuredContent) ?? root;
};

const firstPresentString = (
	...values: readonly unknown[]
): string | undefined => {
	for (const value of values) {
		const normalized = asString(value)?.trim();
		if (normalized) return normalized;
	}
	return undefined;
};

const firstPresentInt = (...values: readonly unknown[]): number | undefined => {
	for (const value of values) {
		const normalized = asFiniteInt(value);
		if (normalized !== undefined) return normalized;
	}
	return undefined;
};

const normalizeMessage = (
	message: string,
): { text: string; redacted: boolean } => {
	const singleLine = message.split(/\r?\n/u, 1)[0]?.trim() ?? '';
	const bounded = singleLine.slice(0, 160);
	const scrubbed = bounded
		.replace(/sk-[A-Za-z0-9_-]{8,}/gu, '[redacted-secret]')
		.replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gu, 'Bearer [redacted-secret]');
	const redacted = redactSecrets(scrubbed).text.trim();
	return {
		text: redacted,
		redacted: redacted !== bounded || scrubbed !== bounded,
	};
};

const normalizeCorrelationId = (value: unknown): string | null => {
	const normalized = asString(value)?.trim();
	if (!normalized) return null;
	if (normalized.length > 128) return null;
	return /^[A-Za-z0-9:_./-]+$/u.test(normalized) ? normalized : null;
};

const explicitRequestType = (
	args: Record<string, unknown> | null,
	result: Record<string, unknown> | null,
): InvocationRequestType | null => {
	const candidate = firstPresentString(
		args?.requestType,
		args?.request_type,
		args?.category,
		result?.requestType,
		result?.request_type,
		result?.category,
	)?.toLowerCase();
	if (!candidate) return null;
	if (
		candidate === 'query' ||
		candidate === 'mutation' ||
		candidate === 'execution' ||
		candidate === 'invocation' ||
		candidate === 'tool-call' ||
		candidate === 'unknown'
	) {
		return candidate;
	}
	if (candidate.includes('read') || candidate.includes('query'))
		return 'query';
	if (
		candidate.includes('write') ||
		candidate.includes('mutat') ||
		candidate.includes('clear') ||
		candidate.includes('close')
	) {
		return 'mutation';
	}
	if (
		candidate.includes('run') ||
		candidate.includes('exec') ||
		candidate.includes('test') ||
		candidate.includes('lint')
	) {
		return 'execution';
	}
	if (candidate.includes('invoke')) return 'invocation';
	return 'unknown';
};

const inferRequestType = (
	toolName: string,
	plugin: string,
	tool: string,
	args: Record<string, unknown> | null,
	result: Record<string, unknown> | null,
): InvocationRequestType => {
	const explicit = explicitRequestType(args, result);
	if (explicit) return explicit;
	if (tool === 'invoke' || toolName.endsWith('_invoke')) return 'invocation';
	const fingerprint = `${plugin}/${tool}`.toLowerCase();
	if (
		/(read|search|list|status|overview|summary|report|get)/u.test(
			fingerprint,
		)
	) {
		return 'query';
	}
	if (
		/(write|create|update|delete|clear|apply|close|claim|record|rename|archive|set|release|reindex)/u.test(
			fingerprint,
		)
	) {
		return 'mutation';
	}
	if (/(run|exec|test|lint|build|validate|install)/u.test(fingerprint)) {
		return 'execution';
	}
	return plugin === 'core' ? 'tool-call' : 'unknown';
};

const deriveCorrelation = (
	args: Record<string, unknown> | null,
	result: Record<string, unknown> | null,
	error: Record<string, unknown> | null,
	sessionId: string,
	plugin: string,
	tool: string,
	endedAt: number,
	needsCorrelation: boolean,
): IInvocationCorrelation | null => {
	const explicitArgs = normalizeCorrelationId(
		firstPresentString(
			args?.correlationId,
			args?.correlation_id,
			args?.requestId,
			args?.request_id,
			args?.traceId,
			args?.trace_id,
			args?.invocationId,
			args?.invocation_id,
		),
	);
	if (explicitArgs) return { id: explicitArgs, source: 'args' };

	const explicitResult = normalizeCorrelationId(
		firstPresentString(
			result?.correlationId,
			result?.correlation_id,
			result?.requestId,
			result?.request_id,
			result?.traceId,
			result?.trace_id,
			result?.dedupeKey,
		),
	);
	if (explicitResult) return { id: explicitResult, source: 'result' };

	const explicitError = normalizeCorrelationId(
		firstPresentString(
			error?.correlationId,
			error?.correlation_id,
			error?.requestId,
			error?.request_id,
			error?.traceId,
			error?.trace_id,
		),
	);
	if (explicitError) return { id: explicitError, source: 'error' };

	if (!needsCorrelation) return null;
	return {
		id: `${sessionId}:${plugin}/${tool}:${endedAt}`,
		source: 'derived',
	};
};

const inferIteration = (
	args: Record<string, unknown> | null,
	result: Record<string, unknown> | null,
	error: Record<string, unknown> | null,
): number | null => {
	const candidate = firstPresentInt(
		args?.iteration,
		args?.attempt,
		args?.attemptNumber,
		args?.retry,
		result?.iteration,
		result?.attempt,
		result?.attemptNumber,
		result?.retry,
		error?.iteration,
		error?.attempt,
	);
	return candidate === undefined ? null : Math.max(0, candidate);
};

const isTimeoutLike = (code: string, message: string): boolean =>
	/timeout|timed out|deadline|abort/iu.test(`${code} ${message}`);

const hasSchemaIncongruence = (
	result: Record<string, unknown> | null,
	message: string | null,
): boolean => {
	if (
		result?.zodError ||
		result?.validationErrors ||
		result?.issues ||
		result?.schemaError
	) {
		return true;
	}
	if (result?.ok === false && result?.error === undefined) return true;
	return message !== null
		? /schema|zod|validation|mismatch|incongruence|invalid type/iu.test(
				message,
			)
		: false;
};

const classifyError = (
	code: string,
	message: string,
	result: Record<string, unknown> | null,
): InvocationErrorClassification => {
	const fingerprint = `${code} ${message}`;
	if (isTimeoutLike(code, message)) return 'timeout';
	if (hasSchemaIncongruence(result, message)) return 'schema-incongruence';
	if (/validation|invalid|parse/iu.test(fingerprint)) return 'validation';
	if (/redact|secret|credential|token|privacy/iu.test(fingerprint)) {
		return 'privacy';
	}
	if (/network|fetch|socket|dns|connect/iu.test(fingerprint))
		return 'network';
	if (/auth|forbidden|unauthori[sz]ed|permission/iu.test(fingerprint)) {
		return 'auth';
	}
	if (code !== 'error' || message !== 'tool returned an error')
		return 'tool-error';
	return 'unknown';
};

const buildErrorTelemetry = (
	errorLike: { code: string; message: string } | null,
	result: Record<string, unknown> | null,
	correlation: IInvocationCorrelation | null,
): IInvocationErrorTelemetry | null => {
	if (!errorLike) {
		if (!hasSchemaIncongruence(result, null)) return null;
		return {
			code: 'schema-incongruence',
			classification: 'schema-incongruence',
			message: 'schema/result incongruence detected',
			correlationId: correlation?.id ?? null,
			incongruence: true,
			redacted: false,
		};
	}
	const normalized = normalizeMessage(errorLike.message);
	const classification = classifyError(
		errorLike.code,
		normalized.text,
		result,
	);
	return {
		code: errorLike.code,
		classification,
		message: normalized.text,
		correlationId: correlation?.id ?? null,
		incongruence:
			classification === 'schema-incongruence' ||
			hasSchemaIncongruence(result, normalized.text),
		redacted: normalized.redacted,
	};
};

const deriveOutcome = (
	baseOutcome: IInvocationRecordTelemetry['outcome'],
	fallbackFrom: string | null,
	errorTelemetry: IInvocationErrorTelemetry | null,
): IInvocationRecordTelemetry['outcome'] => {
	if (errorTelemetry?.classification === 'timeout') return 'timeout';
	if (baseOutcome === 'error') return 'error';
	if (fallbackFrom) return 'fallback';
	return 'success';
};

const tokenCountOf = (record: IInvocationRecordTelemetry): number | null => {
	const total = record.usage?.totalTokens;
	if (typeof total === 'number' && Number.isFinite(total)) return total;
	const input = record.usage?.inputTokens ?? 0;
	const output = record.usage?.outputTokens ?? 0;
	return input > 0 || output > 0 ? input + output : null;
};

export const resolveInvocationSessionId = resolveSessionId;

export const buildInvocationRecord = (
	input: IBuildInvocationRecordInput,
): IInvocationRecordTelemetry => {
	const base = buildRecord(input) as IInvocationRecordTelemetry;
	const args = asRecord(input.args);
	const result = structuredOf(input.result);
	const error = asRecord(input.error);
	const schemaIncongruence = hasSchemaIncongruence(
		result,
		base.error?.message ?? null,
	);
	const correlation = deriveCorrelation(
		args,
		result,
		error,
		base.sessionId,
		base.plugin,
		base.tool,
		input.endedAt,
		base.error !== null || schemaIncongruence,
	);
	const errorTelemetry = buildErrorTelemetry(base.error, result, correlation);
	const requestType = inferRequestType(
		input.toolName,
		base.plugin,
		base.tool,
		args,
		result,
	);
	const iteration = inferIteration(args, result, error);
	const latencyMs = base.durationMs;
	const tokenCount = tokenCountOf(base);
	const outcome = deriveOutcome(
		base.outcome,
		base.fallbackFrom,
		errorTelemetry,
	);

	return {
		...base,
		...(input.host !== undefined ? { host: input.host } : {}),
		outcome,
		error: errorTelemetry
			? {
					code: errorTelemetry.code,
					message: errorTelemetry.message,
				}
			: base.error,
		requestType,
		iteration,
		retry:
			iteration !== null
				? iteration > 1
				: (asBoolean(args?.retry) ?? asBoolean(result?.retry) ?? false),
		correlation,
		latencyMs,
		tokenCount,
		successful: outcome === 'success',
		failure: outcome !== 'success',
		errorTelemetry,
		dimensions: {
			plugin: base.plugin,
			tool: base.tool,
			model: base.model
				? `${base.model.provider}/${base.model.modelId}`
				: null,
			agent: base.agent.kind,
			requestType,
			outcome,
			error: errorTelemetry?.classification ?? null,
			correlation: correlation?.id ?? null,
			iteration,
			latencyMs,
			tokenCount,
		},
	};
};
