/**
 * route-identity.ts — f00507 S1.
 *
 * Separates two things the router currently confuses: what a model can
 * do, and what it costs to reach it.
 *
 * The same model reached through an included plan, a direct subscription
 * and a pay-per-token API has one capability and three economies. Today
 * cost is attached to the model, so the router cannot express the most
 * obvious correct decision there is: between two routes to the SAME
 * model, one with 80% of its plan left and one with 10%, prefer the
 * first; and between one already paid for and one that starts spending
 * money, prefer the paid one.
 *
 * ## Why quota is not money
 *
 * The trap this module is shaped to avoid. A plan with zero marginal
 * cost does not have infinite quota. If scarcity is folded into cost,
 * every included route looks free, and the router will happily burn the
 * scarce reserve on trivial work and then have nothing left when
 * something hard arrives. So money and scarcity are separate dimensions,
 * and scarcity is derived from what remains and when it resets — a
 * quota that refills in an hour is not scarce at 10%, and one that
 * refills next month is.
 *
 * ## Why unknown billing is its own mode
 *
 * `unknown` is not a synonym for free. A route whose billing nobody
 * established is exactly the one that must not be used by default,
 * because the failure mode is spending real money nobody authorised.
 * Modelling it as its own value is what lets the gates in S2 refuse it
 * without having to guess.
 */

export type TAccessMode =
	| 'local'
	| 'plan-included'
	| 'subscription'
	| 'prepaid'
	| 'metered';

/**
 * How a route is paid for. `unknown` is deliberately present and
 * deliberately not free: it is what an undiscovered route is, and it is
 * what the gates refuse.
 */
export type TBillingMode =
	| 'local'
	| 'free'
	| 'plan-included'
	| 'prepaid'
	| 'metered'
	| 'unknown';

export interface IRouteIdentityParts {
	readonly provider: string;
	/** The account or profile, since one provider can have several. */
	readonly account: string;
	readonly accessMode: TAccessMode;
	/** The runtime reaching it — a CLI, an SDK, an MCP server. */
	readonly runtime: string;
	readonly model: string;
}

/**
 * A stable identity, reproducible across sessions.
 *
 * Deliberately human-readable rather than hashed: this string appears in
 * budgets, logs and user-facing preferences, and an operator has to be
 * able to tell two routes apart at a glance. Segments are separated by
 * `:` and any `:` inside a segment is escaped, so the identity can
 * always be split back into exactly five parts.
 */
export const routeIdentity = (parts: IRouteIdentityParts): string =>
	[
		parts.provider,
		parts.account,
		parts.accessMode,
		parts.runtime,
		parts.model,
	]
		.map((segment) =>
			segment.split('\\').join('\\\\').split(':').join('\\:'),
		)
		.join(':');

/** Splits an identity back into its five segments. */
export const parseRouteIdentity = (
	identity: string,
): readonly string[] | undefined => {
	const segments: string[] = [];
	let current = '';
	let escaping = false;
	for (const character of identity) {
		if (escaping) {
			current += character;
			escaping = false;
			continue;
		}
		if (character === '\\') {
			escaping = true;
			continue;
		}
		if (character === ':') {
			segments.push(current);
			current = '';
			continue;
		}
		current += character;
	}
	segments.push(current);
	return segments.length === 5 ? segments : undefined;
};

export interface IRouteEconomics {
	readonly billing: TBillingMode;
	/**
	 * Cost of one more unit of work on this route, in the host's
	 * currency. Zero for local, free and plan-included — which is
	 * exactly why quota has to be tracked separately.
	 */
	readonly marginalCost: number;
	/** Units of quota left in the current period, when the route has one. */
	readonly quotaRemaining?: number | undefined;
	/** Units the period started with. Needed to read `remaining` as a share. */
	readonly quotaTotal?: number | undefined;
	/** Epoch millis at which the quota refills. */
	readonly quotaResetsAt?: number | undefined;
	/** Spendable balance, for prepaid routes. */
	readonly balance?: number | undefined;
}

export interface IRoute {
	readonly identity: string;
	readonly parts: IRouteIdentityParts;
	readonly economics: IRouteEconomics;
}

export const describeRoute = (
	parts: IRouteIdentityParts,
	economics: IRouteEconomics,
): IRoute => ({ identity: routeIdentity(parts), parts, economics });

/** How pressed a quota is, on its own scale, with money nowhere in it. */
export type TScarcity = 'none' | 'ample' | 'tight' | 'critical';

const HOUR_MS = 3_600_000;

/**
 * Scarcity from what is left and when it refills.
 *
 * The reset time is half the answer, not decoration. Ten per cent of a
 * quota that refills within the hour is not scarce — spending it costs
 * almost nothing, because it comes back before it is needed again. Ten
 * per cent of a monthly quota is the last of it. Treating those the same
 * is how a router either hoards a quota it should be using or burns one
 * it will miss.
 */
export const quotaScarcity = (
	economics: IRouteEconomics,
	now: number = Date.now(),
): TScarcity => {
	const { quotaRemaining, quotaTotal } = economics;
	if (quotaRemaining === undefined || quotaTotal === undefined) return 'none';
	if (quotaTotal <= 0) return 'none';
	const share = Math.max(0, quotaRemaining) / quotaTotal;
	const refillsIn =
		economics.quotaResetsAt === undefined
			? Number.POSITIVE_INFINITY
			: Math.max(0, economics.quotaResetsAt - now);

	// Refilling imminently: what is left barely matters.
	if (refillsIn <= HOUR_MS) return share <= 0.05 ? 'tight' : 'ample';
	if (share <= 0.1) return 'critical';
	if (share <= 0.35) return 'tight';
	return 'ample';
};

/**
 * How much of the quota is left, as a fraction, or 1 when there is no
 * quota to speak of.
 *
 * `quotaScarcity` answers the question that changes behaviour, and it
 * answers it in buckets on purpose — a policy that reacts continuously
 * to a number the provider reports approximately would jitter. But
 * buckets cannot separate two routes that fall in the same one, and a
 * plan at 80% and a plan at 50% are both `ample`. This is the raw
 * fraction, for use as a tiebreak *within* a bucket and nothing else.
 *
 * An absent or nonsensical quota reads as 1: no evidence of scarcity is
 * not evidence of scarcity.
 */
export const quotaHeadroom = (economics: IRouteEconomics): number => {
	const { quotaRemaining, quotaTotal } = economics;
	if (quotaRemaining === undefined || quotaTotal === undefined) return 1;
	if (quotaTotal <= 0) return 1;
	return Math.min(1, Math.max(0, quotaRemaining) / quotaTotal);
};

/**
 * Whether using this route spends money.
 *
 * Local, free and plan-included do not. `unknown` counts as spending,
 * because assuming otherwise is the one mistake that costs the user
 * real money without being asked.
 */
export const spendsMoney = (economics: IRouteEconomics): boolean =>
	economics.billing === 'prepaid' ||
	economics.billing === 'metered' ||
	economics.billing === 'unknown' ||
	economics.marginalCost > 0;
