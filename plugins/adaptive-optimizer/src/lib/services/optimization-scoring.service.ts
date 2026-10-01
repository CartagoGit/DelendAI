/**
 * Pure multi-objective scorer for adaptive optimizer candidates.
 *
 * Scale choices:
 * - utility = successRate * 100
 * - relevance/confidence stay normalized in [0, 1]
 * - tokenTax/latencyTax/permissionRisk are normalized to [0, 1]
 *   via fixed divisors so the scorer is deterministic and I/O-free.
 */
import { PERMISSION_RISK_WEIGHTS } from '@delendai/core/public';

import {
	ADAPTIVE_OPTIMIZER_UTILITY_SCALE,
	OPTIMIZATION_CONFIDENCE_WEIGHT,
	OPTIMIZATION_LATENCY_MS_NORMALIZER,
	OPTIMIZATION_LATENCY_TAX_WEIGHT,
	OPTIMIZATION_PERMISSION_RISK_NORMALIZER,
	OPTIMIZATION_PERMISSION_RISK_WEIGHT,
	OPTIMIZATION_RELEVANCE_WEIGHT,
	OPTIMIZATION_TOKEN_COST_NORMALIZER,
	OPTIMIZATION_TOKEN_TAX_WEIGHT,
} from '../contracts/constants/adaptive-optimizer.constant';
import type {
	IOptimizationCandidate,
	IOptimizationScore,
	IOptimizationSignals,
} from '../contracts/interfaces/adaptive-optimizer.interface';

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));

const clamp01 = (value: number): number =>
	Number.isFinite(value) ? clamp(value, 0, 1) : 0;

const round = (value: number): number => Number(value.toFixed(3));

const derivePermissionRiskRaw = (
	candidate: IOptimizationCandidate,
	signals: IOptimizationSignals,
): number => {
	if (typeof signals.permissionRisk === 'number') {
		return Math.max(0, signals.permissionRisk);
	}
	return (candidate.permissions ?? []).reduce(
		(total, permission) => total + PERMISSION_RISK_WEIGHTS[permission],
		0,
	);
};

export const scoreOptimizationCandidate = (
	candidate: IOptimizationCandidate,
	signals: IOptimizationSignals,
): IOptimizationScore => {
	const utility = round(
		clamp01(signals.successRate) * ADAPTIVE_OPTIMIZER_UTILITY_SCALE,
	);
	const relevance = round(clamp01(signals.relevance));
	const confidence = round(clamp01(signals.confidence));
	const tokenTax = round(
		clamp01(signals.tokenCost / OPTIMIZATION_TOKEN_COST_NORMALIZER),
	);
	const latencyTax = round(
		clamp01(signals.latencyMs / OPTIMIZATION_LATENCY_MS_NORMALIZER),
	);
	const permissionRisk = round(
		clamp01(
			derivePermissionRiskRaw(candidate, signals) /
				OPTIMIZATION_PERMISSION_RISK_NORMALIZER,
		),
	);
	const score = round(
		clamp(
			utility +
				relevance * OPTIMIZATION_RELEVANCE_WEIGHT +
				confidence * OPTIMIZATION_CONFIDENCE_WEIGHT -
				tokenTax * OPTIMIZATION_TOKEN_TAX_WEIGHT -
				latencyTax * OPTIMIZATION_LATENCY_TAX_WEIGHT -
				permissionRisk * OPTIMIZATION_PERMISSION_RISK_WEIGHT,
			0,
			100,
		),
	);
	return {
		score,
		utility,
		relevance,
		confidence,
		tokenTax,
		latencyTax,
		permissionRisk,
	};
};
