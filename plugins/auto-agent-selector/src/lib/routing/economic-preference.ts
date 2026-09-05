/**
 * economic-preference.ts — f00507 S3.
 *
 * Ordering routes that have ALREADY passed the gates.
 *
 * This runs strictly after `eligibility-gates`, and that sequencing is
 * the security property: everything here is a preference between
 * permitted options, so no ranking this file could ever produce can
 * reach a route the user did not authorise. Learning may later replace
 * the quality estimates below; it still cannot widen what is permitted,
 * because permission was decided in a phase that already finished.
 *
 * ## Spend what is already paid for first
 *
 * Between two routes to the same model with equivalent results, the one
 * included in a plan already paid for beats the one that starts a bill.
 * This is the cheapest correct decision the router can make and the one
 * it could not previously express at all.
 *
 * ## Quality has to beat opportunity cost, not just be higher
 *
 * The subtle half. A slightly better model is not worth the last of a
 * scarce monthly quota when the task is a typo — the reserve is worth
 * more later, on work that needs it. So a quality advantage is weighed
 * against what spending it costs, and the weighing depends on how much
 * is at stake: a trivial task has to clear a much higher bar to justify
 * touching a critical reserve than an important one does.
 *
 * The consequence, stated plainly because it is easy to implement the
 * opposite by accident: a small quality edge never wins on its own.
 */
import {
	quotaHeadroom,
	quotaScarcity,
	spendsMoney,
	type IRoute,
	type TScarcity,
} from './route-identity.js';

export interface IRouteQuality {
	/** 0..1 — how well this route has done on comparable work. */
	readonly score: number;
	/** 0..1 — how much evidence that score rests on. */
	readonly confidence: number;
}

export interface IPreferenceContext {
	/** How much the task matters. Sets the bar a quality edge must clear. */
	readonly stakes: 'trivial' | 'normal' | 'high';
	/** The user authorised paying more for a substantially better result. */
	readonly allowPaidUpgrade?: boolean | undefined;
}

export interface IRankedRoute {
	readonly route: IRoute;
	readonly quality: IRouteQuality;
	readonly score: number;
	readonly reasons: readonly string[];
}

/** What using a route costs beyond money: how much of a reserve it eats. */
const SCARCITY_PENALTY: Readonly<Record<TScarcity, number>> = {
	none: 0,
	ample: 0,
	tight: 0.15,
	critical: 0.45,
};

/**
 * How much better a paid route must be before it beats a free one.
 *
 * Higher for trivial work, because the whole point is that a small edge
 * must not start a bill on something that did not need it.
 */
const UPGRADE_BAR: Readonly<Record<IPreferenceContext['stakes'], number>> = {
	trivial: 0.5,
	normal: 0.25,
	high: 0.12,
};

/** Already-paid routes get a standing advantage over billed ones. */
const ALREADY_PAID_BONUS = 0.3;

/**
 * Weight of the within-bucket quota tiebreak.
 *
 * Strictly smaller than the smallest distance between two scarcity
 * penalties (0.15), so a fuller quota can decide between equals but can
 * never carry a route past one that is in a healthier bucket. A test
 * pins that relationship, because the bound is the whole justification
 * for adding a continuous term to a deliberately discrete policy.
 */
const HEADROOM_TIEBREAK = 0.02;

/**
 * Score one eligible route. Higher is better.
 *
 * Quality is discounted by how much evidence it rests on, so a
 * spectacular score from one lucky call does not outrank a solid record.
 */
export const scoreRoute = (
	route: IRoute,
	quality: IRouteQuality,
	context: IPreferenceContext,
	now: number = Date.now(),
): IRankedRoute => {
	const reasons: string[] = [];
	const evidenced = quality.score * quality.confidence;
	let score = evidenced;
	reasons.push(
		`quality ${quality.score.toFixed(2)} discounted by confidence ${quality.confidence.toFixed(2)}`,
	);

	if (!spendsMoney(route.economics)) {
		score += ALREADY_PAID_BONUS;
		reasons.push('already paid for, so using it starts no bill');
	} else {
		reasons.push('spends money, so it must clearly beat a paid-for route');
	}

	const scarcity = quotaScarcity(route.economics, now);
	const penalty = SCARCITY_PENALTY[scarcity];
	if (penalty > 0) {
		// Weigh scarcity harder when the task does not warrant it: the
		// reserve is worth more on work that needs it.
		const weighted =
			context.stakes === 'trivial'
				? penalty * 2
				: context.stakes === 'high'
					? penalty * 0.5
					: penalty;
		score -= weighted;
		reasons.push(
			`quota is ${scarcity}; spending it on ${context.stakes} work costs ${weighted.toFixed(2)}`,
		);
	}

	// Within one scarcity bucket, prefer the route with more left. The
	// bucket decides the policy; this only breaks a tie inside it, and
	// is bounded below the smallest gap between two buckets (0.15) so it
	// can never promote a route across one.
	const headroom = quotaHeadroom(route.economics);
	score += HEADROOM_TIEBREAK * headroom;
	if (headroom < 1) {
		reasons.push(
			`${(headroom * 100).toFixed(0)}% of its quota is left, which breaks ties against an equally scored route with less`,
		);
	}

	return { route, quality, score: Number(score.toFixed(4)), reasons };
};

export interface IPreferenceOutcome {
	readonly chosen?: IRankedRoute | undefined;
	readonly ranked: readonly IRankedRoute[];
	readonly reason: string;
}

/**
 * Pick among eligible routes.
 *
 * A paid route only wins over a free one when its evidenced quality
 * clears the bar for the stakes AND the user authorised paying more.
 * Without that authorisation the free route wins regardless of score —
 * which is what makes "payment disabled" a fact about the world rather
 * than a strong opinion the ranker can talk itself out of.
 */
export const preferRoute = (
	candidates: readonly {
		readonly route: IRoute;
		readonly quality: IRouteQuality;
	}[],
	context: IPreferenceContext,
	now: number = Date.now(),
): IPreferenceOutcome => {
	if (candidates.length === 0) {
		return { ranked: [], reason: 'no eligible route to choose between' };
	}

	const ranked = candidates
		.map((candidate) =>
			scoreRoute(candidate.route, candidate.quality, context, now),
		)
		.sort((left, right) => right.score - left.score);

	const free = ranked.filter((entry) => !spendsMoney(entry.route.economics));
	const paid = ranked.filter((entry) => spendsMoney(entry.route.economics));

	const bestFree = free[0];
	const bestPaid = paid[0];

	if (bestFree === undefined) {
		return {
			chosen: bestPaid,
			ranked,
			reason: 'every eligible route bills, so the best-scoring one wins',
		};
	}
	if (bestPaid === undefined) {
		return {
			chosen: bestFree,
			ranked,
			reason: 'the best already-paid route wins; nothing here would start a bill',
		};
	}

	if (context.allowPaidUpgrade !== true) {
		return {
			chosen: bestFree,
			ranked,
			reason: 'a paid upgrade was not authorised, so the already-paid route wins whatever the scores say',
		};
	}

	const edge =
		bestPaid.quality.score * bestPaid.quality.confidence -
		bestFree.quality.score * bestFree.quality.confidence;
	const bar = UPGRADE_BAR[context.stakes];

	if (edge < bar) {
		return {
			chosen: bestFree,
			ranked,
			reason: `the paid route is only ${edge.toFixed(2)} better on evidenced quality, below the ${bar.toFixed(2)} that ${context.stakes} work requires before starting a bill`,
		};
	}

	return {
		chosen: bestPaid,
		ranked,
		reason: `the paid route is ${edge.toFixed(2)} better on evidenced quality, clearing the ${bar.toFixed(2)} bar for ${context.stakes} work, and a paid upgrade is authorised`,
	};
};
