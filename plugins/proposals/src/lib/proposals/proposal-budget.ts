/**
 * proposal-budget.ts
 *
 * Runtime budget enforcement for the host project proposals.
 *
 * `validateBudget(budget, observed)` compares declared limits against actual
 * observed usage and returns a structured result with per-field violations.
 *
 * Severity policy:
 *   block — hard limit; delivery_verifier must reject the slice.
 *   warn  — soft limit; operator should investigate but close is not blocked.
 *
 * Current policy (informed by the original proposal):
 *   - iterations, premiumCalls → 'block'
 *   - inputTokens, outputTokens, toolCalls → 'warn'
 *     (token limits are declared, not measurable from inside the workspace)
 */

// ---------------------------------------------------------------------------
// IProposalBudget — defined here so that both proposal-document.ts and the
// pre-existing spec at tests/src/proposals/proposal-budget.spec.ts can import
// it from a single canonical location.
// ---------------------------------------------------------------------------

export interface IProposalBudget {
	readonly maxInputTokens?: number;
	readonly maxOutputTokens?: number;
	readonly maxIterations?: number;
	readonly maxToolCalls?: number;
	readonly maxPremiumCalls?: number;
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export type IBudgetViolationSeverity = 'block' | 'warn';

export interface IBudgetViolation {
	readonly field: string;
	readonly limit: number;
	readonly observed: number;
	readonly severity: IBudgetViolationSeverity;
}

export interface IBudgetValidationResult {
	readonly withinBudget: boolean;
	readonly violations: readonly IBudgetViolation[];
}

export interface IObservedUsage {
	readonly inputTokens?: number;
	readonly outputTokens?: number;
	readonly iterations?: number;
	readonly toolCalls?: number;
	readonly premiumCalls?: number;
}

// ---------------------------------------------------------------------------
// Validation logic
// ---------------------------------------------------------------------------

type IFieldDef = {
	budgetKey: keyof IProposalBudget;
	observedKey: keyof IObservedUsage;
	field: string;
	severity: IBudgetViolationSeverity;
};

const FIELD_DEFS: readonly IFieldDef[] = [
	{
		budgetKey: 'maxInputTokens',
		observedKey: 'inputTokens',
		field: 'maxInputTokens',
		severity: 'warn',
	},
	{
		budgetKey: 'maxOutputTokens',
		observedKey: 'outputTokens',
		field: 'maxOutputTokens',
		severity: 'warn',
	},
	{
		budgetKey: 'maxIterations',
		observedKey: 'iterations',
		field: 'maxIterations',
		severity: 'block',
	},
	{
		budgetKey: 'maxToolCalls',
		observedKey: 'toolCalls',
		field: 'maxToolCalls',
		severity: 'warn',
	},
	{
		budgetKey: 'maxPremiumCalls',
		observedKey: 'premiumCalls',
		field: 'maxPremiumCalls',
		severity: 'block',
	},
];

/**
 * Validates observed usage against a declared budget.
 *
 * @param budget   The declared limits (all fields optional). An empty budget
 *                 means no enforcement — `withinBudget` is always `true`.
 * @param observed The actual usage metrics (all fields optional). Missing
 *                 fields are treated as 0.
 */
export const validateBudget = (
	budget: IProposalBudget,
	observed: IObservedUsage,
): IBudgetValidationResult => {
	const violations: IBudgetViolation[] = [];

	for (const def of FIELD_DEFS) {
		const limit = budget[def.budgetKey];
		if (limit === undefined) continue; // No limit declared → skip.

		const observedValue = observed[def.observedKey] ?? 0;
		if (observedValue > limit) {
			violations.push({
				field: def.field,
				limit,
				observed: observedValue,
				severity: def.severity,
			});
		}
	}

	const hasBlockingViolation = violations.some((v) => v.severity === 'block');
	const hasWarnViolation = violations.some((v) => v.severity === 'warn');

	return {
		withinBudget: !hasBlockingViolation && !hasWarnViolation,
		violations,
	};
};
