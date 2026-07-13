/**
 * record.ts — build an `IInvocationRecord` from the observability hooks.
 *
 * The generic `IHostObservability.onToolCall` hook carries only
 * `(toolName, args, result, error)` — it knows nothing about models. For
 * plain plugin/core calls the model/usage/cost fields are `null`. When a
 * call IS orchestrated (the `orchestrator-runner`'s `invoke` tool, S6),
 * its structured result carries `usage` + a `model`/`decision` block; we
 * extract those opportunistically so cost accounting lights up without a
 * new contract. Everything here is metadata only — never message content.
 */
import type { ProviderKind } from '@mcp-vertex/core/public';

import { attributeTool } from './attribute';
import { extractAutoBypassed } from './auto-bypass';
import type {
	IAgentDescriptor,
	IInvocationOutcome,
	IInvocationRecord,
	IModelDescriptor,
	IUsageTokens,
} from './types';

const PROVIDER_KINDS: readonly ProviderKind[] = [
	'api',
	'subscription',
	'cli',
	'mcp-server',
];

const asRecord = (value: unknown): Record<string, unknown> | null =>
	value && typeof value === 'object'
		? (value as Record<string, unknown>)
		: null;

const asNumber = (value: unknown): number | undefined =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const asString = (value: unknown): string | undefined =>
	typeof value === 'string' ? value : undefined;

/** Reach into a tool result for a `structuredContent` / `content` payload. */
const structuredOf = (result: unknown): Record<string, unknown> | null => {
	const root = asRecord(result);
	if (!root) return null;
	return asRecord(root.structuredContent) ?? root;
};

/** Pull `{inputTokens, outputTokens, totalTokens}` from a result if present. */
export const extractUsage = (result: unknown): IUsageTokens | null => {
	const structured = structuredOf(result);
	const usage = asRecord(structured?.usage);
	if (!usage) return null;
	const inputTokens = asNumber(usage.inputTokens ?? usage.input_tokens);
	const outputTokens = asNumber(usage.outputTokens ?? usage.output_tokens);
	const totalTokens =
		asNumber(usage.totalTokens ?? usage.total_tokens) ??
		(inputTokens !== undefined && outputTokens !== undefined
			? inputTokens + outputTokens
			: undefined);
	if (
		inputTokens === undefined &&
		outputTokens === undefined &&
		totalTokens === undefined
	) {
		return null;
	}
	return {
		...(inputTokens !== undefined ? { inputTokens } : {}),
		...(outputTokens !== undefined ? { outputTokens } : {}),
		...(totalTokens !== undefined ? { totalTokens } : {}),
	};
};

/** Pull `{provider, modelId, kind}` from an orchestrated result if present. */
export const extractModel = (result: unknown): IModelDescriptor | null => {
	const structured = structuredOf(result);
	if (!structured) return null;
	const modelBlock =
		asRecord(structured.model) ??
		asRecord(asRecord(structured.decision)?.targetProvider);
	if (!modelBlock) return null;
	const provider = asString(modelBlock.provider) ?? asString(modelBlock.id);
	const modelId = asString(modelBlock.modelId ?? modelBlock.model);
	const rawKind = asString(modelBlock.kind);
	const kind = PROVIDER_KINDS.includes(rawKind as ProviderKind)
		? (rawKind as ProviderKind)
		: 'api';
	if (!provider && !modelId) return null;
	return {
		provider: provider ?? 'unknown',
		modelId: modelId ?? 'unknown',
		kind,
	};
};

/** Pull a saving stamped by token-efficiency tools (legacy rows omit it). */
export const extractTokensSaved = (result: unknown): number => {
	const structured = structuredOf(result);
	const accounting = asRecord(structured?.tokenAccounting);
	const savings = asRecord(structured?.savings);
	const value = asNumber(
		structured?.tokensSaved ??
			accounting?.tokensSaved ??
			savings?.tokensSaved,
	);
	return value === undefined ? 0 : Math.max(0, value);
};

const extractError = (
	result: unknown,
	error: unknown,
): { code: string; message: string } | null => {
	if (error !== undefined && error !== null) {
		if (error instanceof Error) {
			return { code: error.name || 'error', message: error.message };
		}
		const rec = asRecord(error);
		if (rec) {
			return {
				code: asString(rec.code) ?? 'error',
				message: asString(rec.message) ?? String(error),
			};
		}
		return { code: 'error', message: String(error) };
	}
	// A tool that returned `{ isError: true, error: {...} }` still failed.
	const root = asRecord(result);
	if (root?.isError === true) {
		const structured = asRecord(structuredOf(result)?.error);
		return {
			code: asString(structured?.code) ?? 'tool-error',
			message: asString(structured?.message) ?? 'tool returned an error',
		};
	}
	return null;
};

export interface IBuildRecordInput {
	readonly toolName: string;
	readonly corePrefix: string;
	readonly peerPrefixes: readonly string[];
	readonly agent: IAgentDescriptor;
	readonly sessionId: string;
	readonly args: unknown;
	readonly result: unknown;
	readonly error?: unknown;
	readonly startedAt?: number | undefined;
	readonly endedAt: number;
	/** Last model observed for this session; used only for a saving-only call. */
	readonly fallbackModel?: IModelDescriptor | null | undefined;
	/** Injected cost function (bound to the resolved pricing table). */
	readonly costOf: (
		model: IModelDescriptor | null,
		usage: IUsageTokens | null,
	) => number | null;
}

/** Assemble one durable invocation record. Pure — no I/O, metadata only. */
export const buildRecord = (input: IBuildRecordInput): IInvocationRecord => {
	const { plugin, tool } = attributeTool(
		input.toolName,
		input.corePrefix,
		input.peerPrefixes,
	);
	const usage = extractUsage(input.result);
	const tokensSaved = extractTokensSaved(input.result);
	const model =
		extractModel(input.result) ??
		(tokensSaved > 0 ? (input.fallbackModel ?? null) : null);
	const errorBlock = extractError(input.result, input.error);
	const structured = structuredOf(input.result);
	const fallbackFrom = asString(structured?.fallbackFrom) ?? null;

	const outcome: IInvocationOutcome =
		errorBlock === null ? 'success' : 'error';

	const durationMs =
		input.startedAt !== undefined
			? Math.max(0, input.endedAt - input.startedAt)
			: null;

	return {
		ts: new Date(input.endedAt).toISOString(),
		sessionId: input.sessionId,
		agent: input.agent,
		plugin,
		tool,
		model,
		usage,
		costUsd: input.costOf(model, usage),
		tokensSaved,
		durationMs,
		outcome,
		fallbackFrom,
		error: errorBlock,
		autoBypassed: extractAutoBypassed(input.result),
	};
};

/**
 * Extract a `sessionId` from tool args (many orchestration tools accept
 * one) falling back to the boot-scoped default so every row is keyed.
 */
export const resolveSessionId = (args: unknown, fallback: string): string => {
	const rec = asRecord(args);
	const fromArgs = rec && asString(rec.sessionId);
	return fromArgs && fromArgs !== '' ? fromArgs : fallback;
};
