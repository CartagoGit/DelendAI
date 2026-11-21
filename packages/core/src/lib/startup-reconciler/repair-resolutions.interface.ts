/**
 * Contract shapes for `./repair-resolutions`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `repair-resolutions.ts`
 * keeps the behaviour, this file keeps the shapes. Re-exported from
 * `repair-resolutions.ts`, so no import site changes.
 */

import type { IStartupFinding } from './contracts';

/** What a human concluded about a repair task the reconciler cannot close. */
export type IRepairDecision =
	/** The work behind the evidence is gone and the loss is accepted. */
	| 'accepted-loss'
	/** The content survives somewhere the reconciler cannot see. */
	| 'resolved-elsewhere'
	/** The observation is real but is not a problem in this repository. */
	| 'not-a-problem';

/** One recorded decision, pinned to the evidence it answered. */
export interface IRepairResolution {
	readonly taskId: string;
	readonly evidenceDigest: string;
	readonly decision: IRepairDecision;
	readonly reason: string;
	readonly decidedBy: string;
	/** ISO-8601 instant. Stored as text so the file stays reviewable. */
	readonly decidedAt: string;
}

/** The tracked file, as it is written on disk. */
export interface IRepairResolutionsFile {
	readonly version: 1;
	readonly resolutions: readonly IRepairResolution[];
}

/** A parse never throws: bad input is reported, never silently honoured. */
export interface IRepairResolutionsParse {
	readonly resolutions: readonly IRepairResolution[];
	readonly errors: readonly string[];
}

/** What a pass over the blockers concluded once decisions were read. */
export interface IResolvedBlockers {
	/** Blockers that still block: unanswered, or answered on stale evidence. */
	readonly blockers: readonly IStartupFinding[];
	/** Notes recording each honoured decision and each stale one. */
	readonly notes: readonly IStartupFinding[];
	/** Task ids whose blocker a decision answered. */
	readonly answeredTaskIds: readonly string[];
	/**
	 * The answered blockers, restated as notes. The evidence stays in the
	 * report exactly as it was observed — only its verdict changed.
	 */
	readonly answered: readonly IStartupFinding[];
}

/** Where recorded resolutions come from. Reading is the only operation. */
export interface IRepairResolutionsSource {
	read(): readonly IRepairResolution[];
}
