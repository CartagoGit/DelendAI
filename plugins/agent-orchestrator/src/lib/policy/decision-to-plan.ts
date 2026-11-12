/**
 * decision-to-plan.ts — f00503 S3.
 *
 * The orchestrator takes its execution mode FROM the decision instead of
 * classifying the task a second time.
 *
 * `TaskClassifier` currently answers "single, linear or swarm?" from the
 * task's own description, which is a second opinion on a question the
 * Adaptive Execution Policy has already answered with far more evidence.
 * Two classifiers that can disagree is not redundancy, it is a bug
 * waiting for the day they do — and the day they do, nothing reports it,
 * because each one is individually behaving as designed.
 *
 * ## Delegation has to earn its cost
 *
 * The rule this module exists to enforce. Splitting work across agents
 * is not free: each one needs its own context, its own budget, and
 * someone has to reconcile the results. That cost is worth paying when
 * the parts are genuinely independent, and pure waste when they are not.
 * Two investigators sent to read the same files produce two readings of
 * the same thing, at twice the price, and then a third step to notice
 * they agree.
 *
 * So delegation requires expected benefit above coordination cost, and
 * the benefit is measured in disjointness — how little the parts share —
 * rather than in how big the task feels.
 *
 * ## Configured modes are constraints, not suggestions
 *
 * `never` means never, including when the decision is confident that a
 * swarm is right. A policy the system may overrule when it disagrees is
 * not a policy; it is a hint, and the user did not write a hint. The
 * only direction the decision may move within `adaptive` is downward
 * from what the host allows.
 */
import type { IExecutionDecision } from './execution-decision.contract.js';
import type { OrchestrationMode } from './types.js';

/** What the host configured about delegating at all. */
export type TDelegationMode = 'adaptive' | 'always' | 'never' | 'manual';

export interface IDelegationCandidate {
	/** How many parts the work would be split into. */
	readonly parts: number;
	/**
	 * 0..1 — how disjoint those parts are. 1 means they share nothing;
	 * 0 means every part reads the same material.
	 */
	readonly disjointness: number;
	/** The user asked for this split explicitly. */
	readonly requestedByUser?: boolean | undefined;
}

/**
 * Coordination overhead, as a share of one agent's work, per extra
 * agent. Splitting into three does not cost three units of coordination
 * — it costs the context each one needs plus the reconciliation at the
 * end, and that grows with the number of parts.
 */
const COORDINATION_COST_PER_PART = 0.35;

/** Below this, parts overlap too much for a split to buy anything. */
const MIN_USEFUL_DISJOINTNESS = 0.5;

export interface IDelegationVerdict {
	readonly delegate: boolean;
	readonly reason: string;
	/** Expected benefit minus coordination cost, in agent-units. */
	readonly netBenefit: number;
}

/**
 * Whether splitting this work across agents is worth what it costs.
 *
 * Benefit is the parallel work actually recovered — parts beyond the
 * first, scaled by how independent they are. Cost grows with each extra
 * agent. Two investigators reading the same files score near zero
 * benefit against a real cost, and are refused.
 */
export const shouldDelegate = (
	candidate: IDelegationCandidate,
): IDelegationVerdict => {
	if (candidate.parts <= 1) {
		return {
			delegate: false,
			reason: 'there is only one part; nothing to delegate',
			netBenefit: 0,
		};
	}
	const extraParts = candidate.parts - 1;
	const benefit = extraParts * candidate.disjointness;
	const cost = extraParts * COORDINATION_COST_PER_PART;
	const netBenefit = Number((benefit - cost).toFixed(4));

	if (candidate.disjointness < MIN_USEFUL_DISJOINTNESS) {
		return {
			delegate: false,
			reason: `the parts overlap too much (disjointness ${candidate.disjointness.toFixed(2)}); agents sent to read the same material produce the same reading twice and then need a third step to notice they agree`,
			netBenefit,
		};
	}
	if (netBenefit <= 0) {
		return {
			delegate: false,
			reason: `coordinating ${candidate.parts.toString()} agents costs more than the parallelism recovers (net ${netBenefit.toFixed(2)})`,
			netBenefit,
		};
	}
	return {
		delegate: true,
		reason: `${candidate.parts.toString()} sufficiently independent parts recover more than coordination costs (net ${netBenefit.toFixed(2)})`,
		netBenefit,
	};
};

export interface IModeResolution {
	readonly mode: OrchestrationMode;
	readonly reason: string;
	/** True when a configured constraint overrode the decision. */
	readonly constrained: boolean;
}

/**
 * The mode to run, from the decision and the host's delegation policy.
 *
 * The decision proposes; the configuration disposes. `never` and
 * `manual` can only narrow, `always` can only widen, and `adaptive`
 * lets the decision stand — but even then the budget the decision
 * itself carries is a ceiling, so a swarm is refused when only one
 * agent was authorised.
 */
export const resolveExecutionMode = (
	decision: IExecutionDecision,
	delegation: TDelegationMode,
	candidate?: IDelegationCandidate,
): IModeResolution => {
	if (delegation === 'never') {
		return {
			mode: 'single',
			reason: 'delegation is configured off; a policy the system may overrule when it disagrees is not a policy',
			constrained: true,
		};
	}

	if (delegation === 'manual' && candidate?.requestedByUser !== true) {
		return {
			mode: 'single',
			reason: 'delegation is manual and this split was not requested, so the orchestrator does not start one on its own',
			constrained: true,
		};
	}

	const proposed = decision.execution;

	if (delegation === 'always') {
		return {
			mode: proposed === 'single' ? 'linear' : proposed,
			reason:
				proposed === 'single'
					? 'delegation is configured on, so even a direct task runs through the delegated path'
					: `the decision chose "${proposed}" and delegation is configured on`,
			constrained: proposed === 'single',
		};
	}

	// adaptive: the decision stands, within what it was authorised.
	if (proposed === 'swarm' && decision.budgets.maxConcurrentAgents < 2) {
		return {
			mode: 'linear',
			reason: `the decision chose "swarm" but only ${decision.budgets.maxConcurrentAgents.toString()} agent was authorised, and an authorised budget is a ceiling rather than a target`,
			constrained: true,
		};
	}

	if (proposed !== 'single' && candidate !== undefined) {
		const verdict = shouldDelegate(candidate);
		if (!verdict.delegate) {
			return {
				mode: 'single',
				reason: `the decision chose "${proposed}" but ${verdict.reason}`,
				constrained: true,
			};
		}
	}

	return {
		mode: proposed,
		reason: `taken from the execution decision (${decision.ceremony}, confidence ${decision.confidence.toFixed(2)}) rather than re-classified`,
		constrained: false,
	};
};
