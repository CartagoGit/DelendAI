/**
 * review-panel-policy.ts — f00508 S3.
 *
 * How many independent reviewers a slice needs, decided by what is at
 * stake rather than charged at a flat rate.
 *
 * The first draft of this proposal put the panel on by default at a
 * quorum of two for every slice. That was wrong, and the reason matters
 * more than the number: every extra reviewer is another agent, another
 * context, another round-trip and another chance for the round to stall.
 * Spending that on a typo buys nominal reliability with exactly the
 * adaptive efficiency this project exists to protect. A fixed quorum
 * would have put constant cost into the system whose whole thesis is
 * spending in proportion to risk.
 *
 * So the quorum is an output of the risk signal, not a constant. This
 * module owns the translation; `f00503` owns producing the signal. Until
 * a signal exists the answer is 1, which is today's behaviour — the
 * panel costs nothing at all until something says it is worth paying
 * for.
 *
 * ## The user's word outranks the calculation, in both directions
 *
 * A configured quorum is honoured whether it is higher or lower than the
 * risk would have chosen, and turning the panel off resolves to 1. A
 * calculation that could override the operator would not be a policy the
 * operator set; it would be a suggestion the system takes when it feels
 * like it.
 *
 * ## Out-of-range values are refused, not clamped
 *
 * Silently clamping a configured 9 to 4 gives the operator a system that
 * disagrees with its own configuration and never says so. The refusal
 * names the value it would accept.
 */

/** What the risk assessment concluded. `f00503` produces this. */
export type TRiskLevel = 'low' | 'normal' | 'high' | 'critical';

export const MIN_QUORUM = 1;
export const MAX_QUORUM = 4;

/**
 * Reviewers by risk.
 *
 * `low` and `normal` get one, which is the pre-panel contract: a second
 * reviewer on a local, reversible change is cost without a matching
 * risk. `high` gets two, where a blind spot shared between implementer
 * and reviewer starts to cost something real. `critical` — a security
 * boundary, a persisted migration, a public contract — gets three,
 * because there the panel is the cheapest part of being wrong.
 */
const QUORUM_BY_RISK: Readonly<Record<TRiskLevel, number>> = {
	low: 1,
	normal: 1,
	high: 2,
	critical: 3,
};

export interface IReviewPanelOptions {
	/** Turning this off resolves a quorum of 1 and restores today's flow. */
	readonly enabled?: boolean | undefined;
	/** An explicit quorum, which wins over the risk calculation. */
	readonly quorum?: number | undefined;
}

export interface IQuorumResolution {
	readonly quorum: number;
	readonly reason: string;
	/** True when configuration decided instead of the risk signal. */
	readonly configured: boolean;
}

export class InvalidQuorumError extends Error {
	readonly value: number;
	constructor(value: number) {
		super(
			`a review quorum of ${value.toString()} is not usable: it must be a whole number between ${MIN_QUORUM.toString()} and ${MAX_QUORUM.toString()}. Below ${MIN_QUORUM.toString()} nothing reviews the work at all, and above ${MAX_QUORUM.toString()} the round costs more to coordinate than the fault it is looking for. Clamping the value silently would leave the system disagreeing with its own configuration without saying so.`,
		);
		this.name = 'InvalidQuorumError';
		this.value = value;
	}
}

const assertUsable = (value: number): number => {
	if (!Number.isInteger(value) || value < MIN_QUORUM || value > MAX_QUORUM) {
		throw new InvalidQuorumError(value);
	}
	return value;
};

/**
 * The quorum for one slice.
 *
 * `risk` is optional because the signal does not exist yet everywhere.
 * Its absence means 1 — the panel is not a default cost, it is a cost
 * something has to justify.
 */
export const resolveReviewQuorum = (
	options: IReviewPanelOptions = {},
	risk?: TRiskLevel,
): IQuorumResolution => {
	if (options.enabled === false) {
		return {
			quorum: MIN_QUORUM,
			configured: true,
			reason: 'the review panel is turned off, so a single reviewer closes a slice exactly as before',
		};
	}

	if (options.quorum !== undefined) {
		return {
			quorum: assertUsable(options.quorum),
			configured: true,
			reason: `the configured quorum of ${options.quorum.toString()} stands; a calculation that could override the operator would not be a policy the operator set`,
		};
	}

	if (risk === undefined) {
		return {
			quorum: MIN_QUORUM,
			configured: false,
			reason: 'no risk signal was produced for this slice, and the panel is a cost something has to justify rather than a default',
		};
	}

	const quorum = QUORUM_BY_RISK[risk];
	return {
		quorum,
		configured: false,
		reason:
			quorum === MIN_QUORUM
				? `risk is ${risk}, so a second reviewer would be cost without a matching risk`
				: `risk is ${risk}, where a blind spot shared between implementer and reviewer costs more than the ${quorum.toString()} reviewers it takes to catch it`,
	};
};

/**
 * The domains that make a change critical regardless of its size.
 *
 * Kept here rather than inferred, because the point of the list is that
 * it is short, explicit and arguable — a heuristic that decided this
 * quietly would be deciding the most expensive case with the least
 * scrutiny.
 */
export const CRITICAL_DOMAINS: readonly string[] = [
	'concurrency',
	'locking',
	'security',
	'migration',
	'public-contract',
];

/** Whether any declared domain makes this change critical. */
export const isCriticalDomain = (domains: readonly string[]): boolean =>
	domains.some((domain) =>
		CRITICAL_DOMAINS.includes(domain.trim().toLowerCase()),
	);
