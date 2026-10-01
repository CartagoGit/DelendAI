/**
 * continuity-enforcer.ts
 *
 * Connects evaluateContinuityPolicy to the runtime of
 * `<prefix>_continue_proposal`. The enforcer is a pure function: it
 * takes an already-resolved cascade decision plus the observed session
 * state (queue, registry, round context), and either lets the
 * decision through or downgrades `decision.mode` to `reset` with a
 * `decision.reason` block describing the offending field.
 *
 * Defaults to the orchestrator's hard policy declared in
 * `.github/agents/orchestrator.agent.md`:
 *   - maxAgentsPerSession: 2
 *   - maxToolRetriesPerSession: 3
 *   - forbidReReadOnUnchangedDigest: true
 *   - requireCheckpointAfterTask: true
 *
 * The caller can override the policy by passing a different one (e.g.
 * a proposal that explicitly allows 4 subagents). Passing `null` as
 * the policy disables enforcement — equivalent to the empty-policy
 * "no enforcement" branch in evaluateContinuityPolicy.
 */

import type { IContinuityCheckResult, IContinuityPolicy } from './swarm-types';
import type { IObservedContinuity } from './continuity-policy';
import { evaluateContinuityPolicy } from './continuity-policy';

// ---------------------------------------------------------------------------
// IEnforceInput / IEnforceOutput
// ---------------------------------------------------------------------------

/**
 * The minimum slice of IContinueProposalStep.decision that the enforcer
 * reads and mutates. Using a structural type keeps the enforcer
 * independent of the full interface (which lives in
 * `contracts/interfaces/the continue-proposal flow.interface.ts`).
 */
export interface IEnforceDecisionLike {
	readonly layer: string;
	readonly proposalId: string;
	readonly mode: string;
	readonly taskHint: string | undefined;
	readonly reason: string;
}

export interface IEnforceInput {
	/** Default policy: orchestrator hard policy. */
	readonly policy: IContinuityPolicy;
	/** Observed session values (queue, registry, round context). */
	readonly observed: IObservedContinuity;
	/** The cascade decision that the enforcer may downgrade. */
	readonly decision: IEnforceDecisionLike;
	/** The closed-tasks log entries consulted during the cascade. */
	readonly closedTasksDigest?: readonly {
		readonly taskId: string;
		readonly closedAt: string;
		readonly agentName: string;
	}[];
	/**
	 * When true, the enforcer only annotates the decision's reason
	 * with a "cross-session resume" hint instead of downgrading. Used
	 * when a previous task is in the closed log and we want to
	 * enrich, not block.
	 */
	readonly annotateOnly?: boolean;
}

export interface IEnforceOutput {
	readonly decision: IEnforceDecisionLike;
	readonly check: IContinuityCheckResult;
	readonly annotated: boolean;
}

// ---------------------------------------------------------------------------
// ORCHESTRATOR_DEFAULT_POLICY
// ---------------------------------------------------------------------------

/**
 * Mirrors the values declared in
 * `.github/agents/orchestrator.agent.md` under "Default continuity
 * policy". Keep both in sync. The enforcer uses this as the default
 * when callers don't pass `policy`.
 */
export const ORCHESTRATOR_DEFAULT_POLICY: IContinuityPolicy = {
	maxAgentSpawnsPerSession: 2,
	maxToolRetriesPerTool: 3,
	forbidReReadOnUnchangedDigest: true,
	requireCheckpointAfterTask: true,
} as const;

// ---------------------------------------------------------------------------
// enforceContinuity
// ---------------------------------------------------------------------------

/**
 * Apply the orchestrator's continuity policy to a resolved cascade
 * decision. Returns the (possibly downgraded) decision plus the raw
 * check result.
 *
 * Algorithm:
 *  1. Run evaluateContinuityPolicy(policy, observed).
 *  2. If `withinPolicy` is true, optionally enrich `decision.reason`
 *     with a cross-session resume hint from `closedTasksDigest`, then
 *     return.
 *  3. If `withinPolicy` is false and any violation has severity
 *     `block`, downgrade `decision.mode` to `reset` and append a
 *     `; continuity-reset: <violation messages>` block to the reason.
 *  4. If all violations are `warn`, leave the decision unchanged but
 *     append the warning text to the reason.
 *
 * @param input See IEnforceInput.
 */
export const enforceContinuity = (input: IEnforceInput): IEnforceOutput => {
	const { policy, observed, decision } = input;
	const check = evaluateContinuityPolicy(policy, observed);

	// Step 1: violations → downgrade.
	if (!check.withinPolicy) {
		const blocking = check.violations.filter((v) => v.severity === 'block');
		const warningOnly =
			blocking.length === 0 && check.violations.length > 0;

		if (blocking.length > 0) {
			const reason = `${decision.reason} ; continuity-reset: ${blocking
				.map((v) => `[${v.field}] ${v.message}`)
				.join(' | ')}`;
			return {
				decision: {
					...decision,
					mode: 'reset',
					reason,
				},
				check,
				annotated: true,
			};
		}

		if (warningOnly === true) {
			const reason = `${decision.reason} ; continuity-warn: ${check.violations
				.map((v) => `[${v.field}] ${v.message}`)
				.join(' | ')}`;
			return {
				decision: {
					...decision,
					reason,
				},
				check,
				annotated: true,
			};
		}
	}

	// Step 2: optional cross-session resume annotation.
	if (
		input.annotateOnly === true &&
		input.closedTasksDigest !== undefined &&
		input.closedTasksDigest.length > 0
	) {
		const previous = input.closedTasksDigest[0];
		if (previous !== undefined) {
			const reason = `${decision.reason} ; cross-session-resume: previous task ${previous.taskId} closed at ${previous.closedAt} by ${previous.agentName}.`;
			return {
				decision: {
					...decision,
					reason,
				},
				check,
				annotated: true,
			};
		}
	}

	return {
		decision,
		check,
		annotated: false,
	};
};
