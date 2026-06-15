/**
 * continuity-policy.ts
 *
 * evaluateContinuityPolicy — evaluates observed session state against a
 * declared IContinuityPolicy, returning a structured result that mirrors
 * the shape of validateBudget from proposal-budget.ts.
 *
 * Shape: { withinPolicy: boolean, violations: IContinuityViolation[] }
 */

import type {
	IContinuityCheckResult,
	IContinuityPolicy,
	IContinuityViolation,
	IContinuityViolationSeverity,
} from './swarm-types';

// ---------------------------------------------------------------------------
// IObservedContinuity — the actual runtime values to compare against policy
// ---------------------------------------------------------------------------

export interface IObservedContinuity {
	readonly tasksCompletedInSession?: number;
	readonly newProposalsOpenedInSession?: number;
	readonly agentSpawnsInSession?: number;
	readonly toolRetriesForTool?: number;
	/** true when the caller intends to re-read a doc whose digest is unchanged */
	readonly willReReadUnchangedDoc?: boolean;
}

// ---------------------------------------------------------------------------
// Field definitions (same structural pattern as FIELD_DEFS in proposal-budget.ts)
// ---------------------------------------------------------------------------

type IFieldDef = {
	policyKey: keyof IContinuityPolicy;
	observedKey: keyof IObservedContinuity;
	field: string;
	severity: IContinuityViolationSeverity;
	getMessage: (limit: number, observed: number) => string;
};

const FIELD_DEFS: readonly IFieldDef[] = [
	{
		policyKey: 'maxTasksPerSession',
		observedKey: 'tasksCompletedInSession',
		field: 'maxTasksPerSession',
		severity: 'block',
		getMessage: (limit, observed) =>
			`Tasks completed (${observed}) exceeds maxTasksPerSession (${limit}).`,
	},
	{
		policyKey: 'maxAgentSpawnsPerSession',
		observedKey: 'agentSpawnsInSession',
		field: 'maxAgentSpawnsPerSession',
		severity: 'block',
		getMessage: (limit, observed) =>
			`Agent spawns (${observed}) exceeds maxAgentSpawnsPerSession (${limit}).`,
	},
	{
		policyKey: 'maxToolRetriesPerTool',
		observedKey: 'toolRetriesForTool',
		field: 'maxToolRetriesPerTool',
		severity: 'warn',
		getMessage: (limit, observed) =>
			`Tool retries (${observed}) exceeds maxToolRetriesPerTool (${limit}).`,
	},
];

// ---------------------------------------------------------------------------
// Boolean policy checks
// ---------------------------------------------------------------------------

const evaluateBooleanChecks = (
	policy: IContinuityPolicy,
	observed: IObservedContinuity
): IContinuityViolation[] => {
	const violations: IContinuityViolation[] = [];

	if (
		policy.forbidNewProposals === true &&
		(observed.newProposalsOpenedInSession ?? 0) > 0
	) {
		violations.push({
			field: 'forbidNewProposals',
			message: `New proposals are forbidden by continuity policy but ${observed.newProposalsOpenedInSession} were opened.`,
			severity: 'block',
		});
	}

	if (
		policy.forbidReReadOnUnchangedDigest === true &&
		observed.willReReadUnchangedDoc === true
	) {
		violations.push({
			field: 'forbidReReadOnUnchangedDigest',
			message:
				'RE_READ_FORBIDDEN: caller declared intent to re-read a core doc whose digest hash is unchanged.',
			severity: 'block',
		});
	}

	return violations;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluates observed session state against a declared IContinuityPolicy.
 *
 * @param policy   The declared limits (all fields optional). An empty policy
 *                 means no enforcement — `withinPolicy` is always `true`.
 * @param observed The actual observed values (all fields optional). Missing
 *                 fields are treated as 0 / false.
 */
export const evaluateContinuityPolicy = (
	policy: IContinuityPolicy,
	observed: IObservedContinuity
): IContinuityCheckResult => {
	const violations: IContinuityViolation[] = [];

	for (const def of FIELD_DEFS) {
		const limit = policy[def.policyKey];
		if (typeof limit !== 'number') continue; // No limit declared → skip.

		const observedValue =
			(observed[def.observedKey] as number | undefined) ?? 0;
		if (observedValue > limit) {
			violations.push({
				field: def.field,
				message: def.getMessage(limit, observedValue),
				severity: def.severity,
			});
		}
	}

	violations.push(...evaluateBooleanChecks(policy, observed));

	return {
		withinPolicy: violations.length === 0,
		violations,
	};
};
