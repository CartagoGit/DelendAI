/**
 * eligibility-gates.ts — f00507 S2.
 *
 * Hard gates, applied in order, before anything is scored.
 *
 * The security property this file exists to guarantee is structural, not
 * behavioural: an unauthorised route must be IMPOSSIBLE to reach by
 * scoring well, not merely unlikely to. That distinction is the whole
 * design. If eligibility were one term in a ranking formula, then a
 * route with an outstanding quality signal could out-score its own
 * refusal — and the day a learned preference gets strong enough, the
 * system starts spending money nobody authorised, with a plausible
 * justification attached.
 *
 * So gating and ranking are different phases. Routes that fail a gate
 * never enter the candidate set, and the ranker is only ever handed
 * routes that were already allowed. Learning can then discover which of
 * the permitted routes works best; it can never widen what is permitted.
 * That is the invariant the proposal asks for, and it is expressible
 * only by keeping the two phases apart.
 *
 * The order matters too, and it runs cheapest-and-most-absolute first:
 * authorisation, entitlement, budget, capabilities, health, quota. A
 * route the user forbade should be refused for THAT reason, not for
 * lacking a capability — the first refusal is the true one, and it is
 * the one an operator needs to see.
 */
import {
	quotaScarcity,
	spendsMoney,
	type IRoute,
	type TBillingMode,
} from './route-identity.js';

/**
 * Billing modes usable without the user opting in.
 *
 * Local, free and plan-included are already paid for. Prepaid, metered
 * and unknown are not, and `unknown` is on this side of the line
 * deliberately: a route whose billing nobody established is exactly the
 * one that must not be reached for by default.
 */
const DEFAULT_ENABLED_BILLING: ReadonlySet<TBillingMode> = new Set([
	'local',
	'free',
	'plan-included',
]);

export type TGateName =
	| 'authorisation'
	| 'entitlement'
	| 'budget'
	| 'capabilities'
	| 'health'
	| 'quota';

/** Order is the contract: the first refusal is the true one. */
export const GATE_ORDER: readonly TGateName[] = [
	'authorisation',
	'entitlement',
	'budget',
	'capabilities',
	'health',
	'quota',
];

export interface IRoutingRequest {
	/** Capabilities the task needs, e.g. `vision`, `long-context`. */
	readonly requiredCapabilities: readonly string[];
	/** Estimated cost of this call in the host's currency. */
	readonly estimatedCost: number;
	/** Quota units this call is expected to consume. */
	readonly estimatedQuotaUnits: number;
	/** The task is trivial, so spending a scarce reserve on it is waste. */
	readonly isTrivial?: boolean | undefined;
}

export interface IRoutingAuthorisation {
	/** Route identities the user explicitly allowed. Empty allows all. */
	readonly allowedRoutes?: readonly string[] | undefined;
	/** Route identities the user explicitly forbade. Always wins. */
	readonly deniedRoutes?: readonly string[] | undefined;
	/** Billing modes turned on beyond the already-paid-for default. */
	readonly enabledBilling?: readonly TBillingMode[] | undefined;
	/** Ceiling for one call. Never a target. */
	readonly maxCostPerCall?: number | undefined;
	/** What is left of the period's authorised spend. */
	readonly remainingPeriodBudget?: number | undefined;
}

export interface IRouteRuntime {
	readonly capabilities: readonly string[];
	/** False when the route is failing, rate-limited or unreachable. */
	readonly healthy: boolean;
}

export interface IEligibilityVerdict {
	readonly route: string;
	readonly eligible: boolean;
	/** Which gate refused it. Absent when eligible. */
	readonly refusedBy?: TGateName | undefined;
	readonly reason: string;
}

const denied = (
	route: string,
	gate: TGateName,
	reason: string,
): IEligibilityVerdict => ({
	route,
	eligible: false,
	refusedBy: gate,
	reason,
});

/**
 * Whether a route may be considered at all.
 *
 * Returns at the FIRST failing gate rather than collecting every
 * failure: an operator asking why a route was not used needs the
 * decisive reason, and "the user forbade it" is a different
 * conversation from "it lacks vision support".
 */
export const checkEligibility = (
	route: IRoute,
	runtime: IRouteRuntime,
	request: IRoutingRequest,
	authorisation: IRoutingAuthorisation = {},
): IEligibilityVerdict => {
	const id = route.identity;

	// 1. Authorisation — the user's explicit word, which nothing overrides.
	if (authorisation.deniedRoutes?.includes(id) === true) {
		return denied(
			id,
			'authorisation',
			'the user explicitly denied this route',
		);
	}
	if (
		authorisation.allowedRoutes !== undefined &&
		authorisation.allowedRoutes.length > 0 &&
		!authorisation.allowedRoutes.includes(id)
	) {
		return denied(
			id,
			'authorisation',
			'an explicit allow-list is configured and this route is not on it',
		);
	}

	// 2. Entitlement — is this way of paying switched on at all?
	const enabled = new Set<TBillingMode>([
		...DEFAULT_ENABLED_BILLING,
		...(authorisation.enabledBilling ?? []),
	]);
	if (!enabled.has(route.economics.billing)) {
		return denied(
			id,
			'entitlement',
			route.economics.billing === 'unknown'
				? "this route's billing was never established, and an unestablished billing mode is not a free one"
				: `"${route.economics.billing}" billing is not enabled; it spends money the user has not authorised`,
		);
	}

	// 3. Budget — a ceiling, never a target.
	if (spendsMoney(route.economics)) {
		if (
			authorisation.maxCostPerCall !== undefined &&
			request.estimatedCost > authorisation.maxCostPerCall
		) {
			return denied(
				id,
				'budget',
				`this call is estimated at ${request.estimatedCost.toString()}, above the per-call ceiling of ${authorisation.maxCostPerCall.toString()}; an authorised budget bounds a call, it does not license one`,
			);
		}
		if (
			authorisation.remainingPeriodBudget !== undefined &&
			request.estimatedCost > authorisation.remainingPeriodBudget
		) {
			return denied(
				id,
				'budget',
				`only ${authorisation.remainingPeriodBudget.toString()} of the period's authorised spend remains, and this call needs ${request.estimatedCost.toString()}`,
			);
		}
	}

	// 4. Capabilities — can it do the job at all?
	const missing = request.requiredCapabilities.filter(
		(capability) => !runtime.capabilities.includes(capability),
	);
	if (missing.length > 0) {
		return denied(
			id,
			'capabilities',
			`the task needs ${missing.join(', ')}, which this route does not provide`,
		);
	}

	// 5. Health — is it working right now?
	if (!runtime.healthy) {
		return denied(
			id,
			'health',
			'the route is currently unhealthy, so preferring it would spend a retry rather than get an answer',
		);
	}

	// 6. Quota — is there enough left, and is spending it here defensible?
	const { quotaRemaining } = route.economics;
	if (
		quotaRemaining !== undefined &&
		request.estimatedQuotaUnits > quotaRemaining
	) {
		return denied(
			id,
			'quota',
			`this call needs ${request.estimatedQuotaUnits.toString()} units and only ${quotaRemaining.toString()} remain in the period`,
		);
	}
	if (
		request.isTrivial === true &&
		quotaScarcity(route.economics) === 'critical'
	) {
		// Not a shortage — a judgement. Burning the last of a scarce
		// reserve on trivial work is how a plan runs out before the task
		// that actually needed it arrives.
		return denied(
			id,
			'quota',
			"this route's quota is critically low and the task is trivial; the reserve is worth more on work that needs it",
		);
	}

	return {
		route: id,
		eligible: true,
		reason: 'passed authorisation, entitlement, budget, capabilities, health and quota',
	};
};

/**
 * The routes a ranker is allowed to see.
 *
 * This is the structural half of the guarantee: the ranker receives
 * only routes that already passed, so no score it could ever produce
 * can promote a refused one. Learning discovers which permitted route
 * is best; it cannot widen what is permitted.
 */
export const eligibleRoutes = (
	candidates: readonly {
		readonly route: IRoute;
		readonly runtime: IRouteRuntime;
	}[],
	request: IRoutingRequest,
	authorisation: IRoutingAuthorisation = {},
): {
	readonly eligible: readonly IRoute[];
	readonly refused: readonly IEligibilityVerdict[];
} => {
	const eligible: IRoute[] = [];
	const refused: IEligibilityVerdict[] = [];
	for (const candidate of candidates) {
		const verdict = checkEligibility(
			candidate.route,
			candidate.runtime,
			request,
			authorisation,
		);
		if (verdict.eligible) eligible.push(candidate.route);
		else refused.push(verdict);
	}
	return { eligible, refused };
};
