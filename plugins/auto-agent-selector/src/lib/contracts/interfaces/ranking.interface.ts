/**
 * ranking.interface.ts — the data contracts for provider RANKING.
 *
 * SRP: shapes only. The ranking logic lives in `routing/`. Kept apart so the
 * recommend tool + tests + later slices (escalation, calibration) share one
 * vocabulary without importing the algorithm.
 */
import type { IProviderCandidate } from './roster.interface';

/**
 * A single provider's placement in a recommendation, with a human-readable
 * rationale so the user can understand *why* — the app recommends, the user
 * decides.
 */
export interface IRankedProvider {
	readonly candidate: IProviderCandidate;
	/** Higher = better fit for the request. Not a probability — a sort key. */
	readonly score: number;
	/** One-line explanation (cost, tier fit, pin) for the UI/CLI/agent. */
	readonly rationale: string;
	/** True when this row is the user's explicit pin (forced to the top). */
	readonly pinned: boolean;
}

/** Inputs to a ranking pass. All optional except the roster + dial. */
export interface IRankInput {
	/** The reachable providers (from discovery). */
	readonly available: readonly IProviderCandidate[];
	/**
	 * The cost↔quality dial, 0 (always the strongest, cost no object) … 10
	 * (always the cheapest that works). Mirrors the industry-standard Auto
	 * Router dial. Clamped to [0, 10]; default handled by the caller.
	 */
	readonly costQualityTradeoff: number;
	/**
	 * A provider id the user has pinned for this task type. When it is
	 * reachable it is forced to the top; the user's choice always wins.
	 */
	readonly pinnedId?: string | undefined;
}
