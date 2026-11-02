import { truncateIfTooLarge } from '@delendai/core/public';
import {
	PROPOSALS_STABLE_TOOL_SURFACE,
	listProposalAdaptiveFacadePaths,
} from '@delendai/proposals/public';
import {
	indexToolInvocationTelemetry,
	type IToolInvocationTelemetrySample,
	type IToolInvocationTelemetrySummary,
} from '@delendai/usage-tracking/public';

import type {
	IAdaptiveFacadeCandidate,
	IAdaptiveFacadeHistoryEntry,
	IAdaptiveFacadeOutput,
	IAdaptiveFacadeRuntimeOptions,
	IAdaptiveFacadeToolArgs,
	IOptimizationSignals,
	TAdaptiveFacadeEffect,
} from '../contracts/interfaces/adaptive-optimizer.interface';
import { scoreOptimizationCandidate } from './optimization-scoring.service';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const round = (value: number, decimals: number = 3): number => {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
};

const DEFAULT_EFFECT_SIGNALS: Record<
	TAdaptiveFacadeEffect,
	{
		readonly successRate: number;
		readonly tokenCost: number;
		readonly latencyMs: number;
	}
> = {
	read: { successRate: 0.93, tokenCost: 96, latencyMs: 80 },
	write: { successRate: 0.82, tokenCost: 148, latencyMs: 130 },
	recovery: { successRate: 0.68, tokenCost: 220, latencyMs: 235 },
};

const EXTRA_CALL_TOKEN_COST = 24;
const EXTRA_CALL_LATENCY_MS = 35;
const DEFAULT_MAX_ALTERNATIVES = 3;

const historyUsageOf = (
	entry: IAdaptiveFacadeHistoryEntry,
): IToolInvocationTelemetrySample['usage'] => {
	if (typeof entry.totalTokens === 'number') {
		return { totalTokens: entry.totalTokens };
	}
	if (
		typeof entry.inputTokens === 'number' ||
		typeof entry.outputTokens === 'number'
	) {
		return {
			...(typeof entry.inputTokens === 'number'
				? { inputTokens: entry.inputTokens }
				: {}),
			...(typeof entry.outputTokens === 'number'
				? { outputTokens: entry.outputTokens }
				: {}),
		};
	}
	return undefined;
};

const toTelemetrySamples = (
	history: readonly IAdaptiveFacadeHistoryEntry[] | undefined,
): readonly IToolInvocationTelemetrySample[] =>
	(history ?? []).map((entry) => ({
		tool: entry.tool,
		outcome: entry.outcome,
		usage: historyUsageOf(entry),
		durationMs: entry.durationMs,
	}));

const confidenceOf = (
	intentFit: number,
	telemetry: IToolInvocationTelemetrySummary | undefined,
): number =>
	clamp01(
		intentFit * 0.72 +
			(telemetry === undefined
				? 0.08
				: Math.min(0.18, telemetry.calls * 0.04)) +
			(telemetry?.averageTokens === null || telemetry === undefined
				? 0
				: 0.04) +
			(telemetry?.averageLatencyMs === null || telemetry === undefined
				? 0
				: 0.04),
	);

const buildSignals = (
	effect: TAdaptiveFacadeEffect,
	intentFit: number,
	sideEffectRisk: number,
	expectedCalls: number,
	telemetry: IToolInvocationTelemetrySummary | undefined,
): IOptimizationSignals => {
	const defaults = DEFAULT_EFFECT_SIGNALS[effect];
	const callCount = telemetry?.calls ?? expectedCalls;
	const extraCalls = Math.max(0, callCount - 1);
	const tokenCost =
		telemetry?.averageTokens ??
		defaults.tokenCost + extraCalls * EXTRA_CALL_TOKEN_COST;
	const latencyMs =
		telemetry?.averageLatencyMs ??
		defaults.latencyMs + extraCalls * EXTRA_CALL_LATENCY_MS;
	const successRate =
		telemetry?.successRate ??
		clamp01(
			defaults.successRate +
				(intentFit - 0.8) * 0.15 -
				sideEffectRisk * 0.04,
		);
	return {
		successRate: round(successRate),
		tokenCost: round(tokenCost),
		latencyMs: round(latencyMs),
		relevance: round(intentFit),
		confidence: round(confidenceOf(intentFit, telemetry)),
		permissionRisk: round(clamp01(sideEffectRisk) * 10),
	};
};

const responseByteSize = (payload: unknown): number =>
	Buffer.byteLength(JSON.stringify(payload), 'utf8');

const finalizeOutput = (
	raw: Omit<IAdaptiveFacadeOutput, 'bytes' | 'truncated'>,
	maxBytes?: number,
): IAdaptiveFacadeOutput => {
	if (maxBytes === undefined) {
		return {
			...raw,
			bytes: responseByteSize(raw),
			truncated: false,
		};
	}
	const direct = truncateIfTooLarge(raw, maxBytes);
	if (!direct.truncated) {
		return { ...raw, bytes: direct.finalBytes, truncated: false };
	}
	for (let size = raw.alternatives.length; size >= 0; size -= 1) {
		const candidate = {
			...raw,
			alternatives: raw.alternatives.slice(0, size),
		};
		const bounded = truncateIfTooLarge(candidate, maxBytes);
		if (!bounded.truncated) {
			return {
				...candidate,
				bytes: bounded.finalBytes,
				truncated: true,
			};
		}
	}
	const minimalSurface = raw.detailedSurface.slice(0, 4);
	const minimal = {
		...raw,
		alternatives: [],
		detailedSurface: minimalSurface,
	};
	return {
		...minimal,
		bytes: truncateIfTooLarge(minimal, maxBytes).finalBytes,
		truncated: true,
	};
};

export const buildAdaptiveFacadePayload = (
	args: IAdaptiveFacadeToolArgs,
	options: IAdaptiveFacadeRuntimeOptions,
): IAdaptiveFacadeOutput => {
	const telemetryByTool = indexToolInvocationTelemetry(
		toTelemetrySamples(args.history),
	);
	const ranked = listProposalAdaptiveFacadePaths(args.intent)
		.map((path) => {
			const telemetry = telemetryByTool.get(path.toolName);
			const signals = buildSignals(
				path.effect,
				path.intentFit,
				path.sideEffectRisk,
				path.expectedCalls,
				telemetry,
			);
			const scored = scoreOptimizationCandidate(
				{ id: path.toolName },
				signals,
			);
			const callCount = telemetry?.calls ?? path.expectedCalls;
			return {
				intent: path.intent,
				toolName: path.toolName,
				plugin: 'proposals',
				effect: path.effect,
				summary: path.summary,
				metrics: {
					successRate: signals.successRate,
					tokenCost: signals.tokenCost,
					callCount,
					latencyMs: signals.latencyMs,
					sideEffectRisk: round(path.sideEffectRisk),
					usedObservedHistory: telemetry !== undefined,
				},
				...scored,
			} satisfies IAdaptiveFacadeCandidate;
		})
		.sort(
			(left, right) =>
				right.score - left.score ||
				left.metrics.callCount - right.metrics.callCount ||
				left.toolName.localeCompare(right.toolName),
		);
	const maxAlternatives = Math.max(
		1,
		Math.min(args.maxAlternatives ?? DEFAULT_MAX_ALTERNATIVES, 10),
	);
	const preferredPath = ranked[0]!;
	return finalizeOutput(
		{
			intent: args.intent,
			preferredPath,
			alternatives: ranked.slice(1, maxAlternatives + 1),
			detailedSurface: PROPOSALS_STABLE_TOOL_SURFACE,
		},
		options.maxBytes,
	);
};
