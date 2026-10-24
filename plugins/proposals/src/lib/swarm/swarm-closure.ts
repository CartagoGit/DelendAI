/**
 * swarm-closure.ts
 *
 * `runSwarmClosure` — final closure decision for a proposal that
 * declares the swarm frontmatter (`swarmBudget`, `continuityPolicy`).
 *
 * Composes:
 *   - `validateBudget` over `IProposalBudget`
 *   - `evaluateContinuityPolicy` (T1) over `IContinuityPolicy`
 *   - A subagent-tree summary (provided by the orchestrator at closure)
 *   - A live-lock snapshot (provided by the orchestrator at closure)
 *   - A boolean `checkpointPresent` (policy-aware)
 *
 * Returns `{ withinSwarmBudget, withinContinuityPolicy, swarmViolations,
 * closureDecision }` where `closureDecision` is
 * `'close' | 'open_fix' | 'open_heredera'`.
 *
 * The verifier (`the delivery-verifier contract`) reads this shape and
 * rejects `done` if `closureDecision !== 'close'`.
 */

import { evaluateContinuityPolicy } from './continuity-policy';
import type {
	IContinuityCheckResult,
	IContinuityPolicy,
	IContinuityViolation,
	IContinuityViolationSeverity,
	ISwarmBudget,
} from './swarm-types';
import { validateBudget } from '../proposals/proposal-budget';
import type {
	IBudgetViolation,
	IBudgetViolationSeverity,
	IProposalBudget,
} from '../proposals/proposal-budget';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single live lock row, captured by the orchestrator at closure time.
 *
 * `lastSeenIso` is the timestamp recorded by the writer; `nowIso` is the
 * timestamp the orchestrator captured when it snapshotted the lock state.
 * Both are ISO 8601 strings.
 */
export interface ILockSnapshot {
	readonly taskId: string;
	readonly agent: string;
	readonly files: readonly string[];
	readonly lastSeenIso: string;
	readonly nowIso: string;
}

/**
 * Subagent registry summary at closure time. The orchestrator collects
 * this from `<prefix>_agent_names` / `.cache/subagent-registry.json`.
 */
export interface IAgentTreeSummary {
	readonly totalAssignments: number;
	readonly activeCount: number;
	readonly cooldownCount: number;
	readonly orphanCount: number;
	readonly adoptedCount: number;
}

export interface ICloseSwarmInput {
	readonly proposalId: string;
	readonly budget: IProposalBudget;
	readonly swarmBudget: ISwarmBudget;
	readonly continuityPolicy: IContinuityPolicy;
	readonly observedUsage: Partial<{
		iterations: number;
		premiumCalls: number;
		toolCalls: number;
		inputTokens: number;
		outputTokens: number;
	}>;
	readonly observedContinuity: Partial<{
		tasksCompletedInSession: number;
		newProposalsOpenedInSession: number;
		agentSpawnsInSession: number;
		toolRetriesForTool: number;
		willReReadUnchangedDoc: boolean;
	}>;
	readonly agentTree: IAgentTreeSummary;
	readonly locks: readonly ILockSnapshot[];
	/** True iff a checkpoint file was emitted for the most recent task. */
	readonly checkpointPresent: boolean;
	/** ISO timestamp the orchestrator captured at closure. */
	readonly nowIso: string;
}

/**
 * A swarm-level violation: a typed union of budget + continuity +
 * structural findings (locks, orphans, missing checkpoint).
 */
export interface ISwarmViolation {
	readonly field: string;
	readonly message: string;
	readonly severity: IContinuityViolationSeverity;
	readonly source:
		| 'budget'
		| 'continuity-policy'
		| 'agent-tree'
		| 'locks'
		| 'checkpoint';
}

export type IClosureDecision = 'close' | 'open_fix' | 'open_heredera';

export interface ICloseSwarmResult {
	readonly withinSwarmBudget: boolean;
	readonly withinContinuityPolicy: boolean;
	readonly swarmViolations: readonly ISwarmViolation[];
	readonly closureDecision: IClosureDecision;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default lock staleness threshold (minutes). Mirrors the lock config. */
export const DEFAULT_STALE_AFTER_MINUTES = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toBudgetViolation = (v: IBudgetViolation): ISwarmViolation => ({
	field: v.field,
	message: `${v.field}: observed ${v.observed} exceeds limit ${v.limit} (severity=${v.severity})`,
	severity: budgetSeverityToContinuity(v.severity),
	source: 'budget',
});

const budgetSeverityToContinuity = (
	s: IBudgetViolationSeverity,
): IContinuityViolationSeverity => s;

const continuityToSwarm = (v: IContinuityViolation): ISwarmViolation => ({
	field: v.field,
	message: v.message,
	severity: v.severity,
	source: 'continuity-policy',
});

const minutesBetween = (laterIso: string, earlierIso: string): number => {
	const later = Date.parse(laterIso);
	const earlier = Date.parse(earlierIso);
	if (Number.isNaN(later) || Number.isNaN(earlier)) {
		// Defensive: unparseable timestamps are not "stale" because we
		// have no reliable signal — treat as fresh rather than as a
		// hard error. Operators should investigate unparseable
		// timestamps upstream (lock writer bug).
		return 0;
	}
	return (later - earlier) / 60_000;
};

const findStaleLocks = (
	locks: readonly ILockSnapshot[],
	staleAfterMinutes: number,
): ILockSnapshot[] =>
	locks.filter(
		(l) => minutesBetween(l.nowIso, l.lastSeenIso) > staleAfterMinutes,
	);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the swarm-closure decision. See module docstring for composition.
 *
 * The function is pure: it does not touch the filesystem, the registry,
 * or the lock. The orchestrator is responsible for collecting the
 * snapshots before calling.
 */
export const runSwarmClosure = (input: ICloseSwarmInput): ICloseSwarmResult => {
	const violations: ISwarmViolation[] = [];

	// 1. Proposal budget. Empty budget → no enforcement.
	const budgetResult = validateBudget(input.budget, input.observedUsage);
	for (const v of budgetResult.violations) {
		violations.push(toBudgetViolation(v));
	}

	// 2. Continuity policy. Empty policy → no enforcement.
	const continuityResult: IContinuityCheckResult = evaluateContinuityPolicy(
		input.continuityPolicy,
		{
			...input.observedContinuity,
			checkpointPresent: input.checkpointPresent,
		},
	);
	for (const v of continuityResult.violations) {
		violations.push(continuityToSwarm(v));
	}

	// 3. Subagent tree: any orphan in the registry rejects closure.
	if (input.agentTree.orphanCount > 0) {
		violations.push({
			field: 'agentRegistry.orphanCount',
			message: `Agent registry reports ${input.agentTree.orphanCount} orphan(s). The registry must be clean before closure.`,
			severity: 'block',
			source: 'agent-tree',
		});
	}

	// 4. Lock state: any stale lock rejects closure.
	const staleLocks = findStaleLocks(input.locks, DEFAULT_STALE_AFTER_MINUTES);
	for (const lock of staleLocks) {
		violations.push({
			field: `locks.${lock.taskId}.lastSeen`,
			message: `Lock held by ${lock.agent} on ${lock.taskId} has not been heartbeated within ${DEFAULT_STALE_AFTER_MINUTES} minutes.`,
			severity: 'block',
			source: 'locks',
		});
	}

	// 5. Closure decision.
	const hasBlock = violations.some((v) => v.severity === 'block');
	const withinSwarmBudget = !budgetResult.violations.some(
		(v) => v.severity === 'block',
	);
	const withinContinuityPolicy =
		continuityResult.withinPolicy &&
		input.agentTree.orphanCount === 0 &&
		staleLocks.length === 0;

	// Decision policy:
	//   - block → 'open_fix' (operator or implementation_runner fixes)
	//   - warn  → 'close' (informational)
	const closureDecision: IClosureDecision = hasBlock ? 'open_fix' : 'close';

	return {
		withinSwarmBudget,
		withinContinuityPolicy,
		swarmViolations: violations,
		closureDecision,
	};
};
